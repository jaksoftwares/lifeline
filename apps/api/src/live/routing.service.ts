import { Injectable, Logger } from '@nestjs/common';
import { estimateDriveMinutes, haversineKm, type LatLng } from '@lifeline/domain';
import { AppConfig } from '../config/app-config';

export interface DriveTime {
  minutes: number;
  source: 'ROAD' | 'ESTIMATE';
}

const TIMEOUT_MS = 2500;
const CACHE_MS = 60_000;

/**
 * Drive times for arrival estimates. Uses an OSRM routing server when OSRM_URL is set, and falls back
 * to the straight-line estimate when it isn't, or when the server is slow or unreachable, so a
 * routing outage never stops tracking.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private readonly cache = new Map<string, { value: DriveTime; until: number }>();

  constructor(private readonly config: AppConfig) {}

  async driveTime(from: LatLng, to: LatLng): Promise<DriveTime> {
    const estimate: DriveTime = {
      minutes: estimateDriveMinutes(haversineKm(from, to)),
      source: 'ESTIMATE',
    };
    const base = this.config.env.OSRM_URL;
    if (!base) return estimate;

    // Positions are rounded to about 100 m so a moving ambulance reuses recent answers.
    const key = [from.latitude, from.longitude, to.latitude, to.longitude]
      .map((n) => n.toFixed(3))
      .join(',');
    const hit = this.cache.get(key);
    if (hit && hit.until > Date.now()) return hit.value;

    try {
      const url = `${base.replace(/\/$/, '')}/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=false`;
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`OSRM answered ${res.status}`);
      const body = (await res.json()) as { code?: string; routes?: { duration: number }[] };
      const seconds = body.routes?.[0]?.duration;
      if (body.code !== 'Ok' || seconds === undefined) throw new Error(`OSRM: ${body.code}`);
      const value: DriveTime = { minutes: Math.max(1, Math.round(seconds / 60)), source: 'ROAD' };
      this.cache.set(key, { value, until: Date.now() + CACHE_MS });
      if (this.cache.size > 5000) this.cache.clear();
      return value;
    } catch (error) {
      this.logger.warn(`Routing unavailable, using estimate: ${(error as Error).message}`);
      return estimate;
    }
  }
}
