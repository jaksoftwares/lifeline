import { Injectable } from '@nestjs/common';
import {
  etaTarget,
  isTracked,
  LOCATION_LOST_AFTER_SECONDS,
  locationFreshness,
  thinPath,
  type TransferStatus,
} from '@lifeline/domain';
import { type TrackingView } from '@lifeline/schemas';
import { type LocationPing } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoutingService } from './routing.service';

const PATH_POINTS = 200;
const PATH_SOURCE_LIMIT = 3000;

interface Place {
  latitude: number | null;
  longitude: number | null;
}

/** What tracking needs to know about a transfer. */
export interface TrackedTransfer {
  id: string;
  status: TransferStatus;
  pickup: Place;
  destination: Place;
  /** The open assignment's vehicle; after a vehicle change only the new vehicle's positions count. */
  vehicleId: string | null;
}

@Injectable()
export class TrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: RoutingService,
  ) {}

  /** Full tracking for one transfer, with its trail. Null when the transfer isn't being tracked. */
  async forTransfer(t: TrackedTransfer, now = new Date()): Promise<TrackingView | null> {
    if (!isTracked(t.status)) return null;
    const pings = await this.prisma.locationPing.findMany({
      where: { transferId: t.id, ...(t.vehicleId ? { vehicleId: t.vehicleId } : {}) },
      orderBy: { recordedAt: 'desc' },
      take: PATH_SOURCE_LIMIT,
    });
    const latest = pings[0] ?? null;
    return {
      ...(await this.summarise(t, latest, now)),
      path: thinPath(
        pings.reverse().map((p) => [p.latitude, p.longitude] as [number, number]),
        PATH_POINTS,
      ),
    };
  }

  /** Last position and arrival estimate for many transfers at once, for lists and the operations board. */
  async forTransfers(
    transfers: TrackedTransfer[],
    now = new Date(),
  ): Promise<Map<string, Pick<TrackingView, 'position' | 'eta'>>> {
    const tracked = transfers.filter((t) => isTracked(t.status));
    const result = new Map<string, Pick<TrackingView, 'position' | 'eta'>>();
    if (tracked.length === 0) return result;
    const latest = await this.prisma.locationPing.findMany({
      where: {
        OR: tracked.map((t) => ({
          transferId: t.id,
          ...(t.vehicleId ? { vehicleId: t.vehicleId } : {}),
        })),
      },
      orderBy: { recordedAt: 'desc' },
      distinct: ['transferId'],
    });
    const byTransfer = new Map(latest.map((p) => [p.transferId, p]));
    await Promise.all(
      tracked.map(async (t) => {
        result.set(t.id, await this.summarise(t, byTransfer.get(t.id) ?? null, now));
      }),
    );
    return result;
  }

  private async summarise(
    t: TrackedTransfer,
    latest: LocationPing | null,
    now: Date,
  ): Promise<Pick<TrackingView, 'position' | 'eta'>> {
    if (!latest) return { position: null, eta: null };
    const position = {
      latitude: latest.latitude,
      longitude: latest.longitude,
      accuracy: latest.accuracy,
      recordedAt: latest.recordedAt.toISOString(),
      freshness: locationFreshness(latest.recordedAt, now),
    };
    const target = etaTarget(t.status);
    const place = target === 'PICKUP' ? t.pickup : target === 'DESTINATION' ? t.destination : null;
    const ageSeconds = (now.getTime() - latest.recordedAt.getTime()) / 1000;
    // An estimate from a position this old would mislead; the screen says to call the crew instead.
    if (
      !target ||
      !place ||
      place.latitude == null ||
      place.longitude == null ||
      ageSeconds > LOCATION_LOST_AFTER_SECONDS
    )
      return { position, eta: null };

    const drive = await this.routing.driveTime(
      { latitude: latest.latitude, longitude: latest.longitude },
      { latitude: place.latitude, longitude: place.longitude },
    );
    // Time already passed since the fix counts against the estimate.
    const minutes = Math.max(1, Math.round(drive.minutes - ageSeconds / 60));
    return {
      position,
      eta: { target, minutes, source: drive.source, from: latest.recordedAt.toISOString() },
    };
  }
}
