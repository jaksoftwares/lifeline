import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  type CrewStatus,
  evaluateCrewUpdate,
  hasPermission,
  MAX_CLOCK_SKEW_MS,
  nextCrewStatus,
  permissionSummary,
  TRANSFER_STATUS_LABELS,
} from '@lifeline/domain';
import {
  type CrewStatusUpdate,
  type CrewSyncInput,
  type CrewSyncResponse,
  type CrewSyncResult,
  type CrewTrip,
  type LocationPing,
} from '@lifeline/schemas';
import { type Institution, type Prisma, type TransferEventType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, NOT_PERMITTED } from '../auth/auth-context';
import { type RequestMeta } from '../common/request-meta';
import { PrismaService } from '../prisma/prisma.service';
import { patientAge, patientDisplayName } from '../referrals/mappers';
import { isUniqueViolation, recordTransferEvent } from '../transport/transfer-records';

/** Journey times kept on the transfer for reporting, in device time. */
const TIMESTAMP_FIELD: Partial<
  Record<CrewStatus, 'dispatchedAt' | 'atPickupAt' | 'collectedAt' | 'arrivedAt'>
> = {
  DISPATCHED: 'dispatchedAt',
  AT_PICKUP: 'atPickupAt',
  PATIENT_COLLECTED: 'collectedAt',
  ARRIVED: 'arrivedAt',
};

const tripInclude = {
  provider: true,
  vehicle: true,
  crew: { include: { crewMember: true } },
  transfer: {
    include: {
      referral: {
        include: { patient: true, acceptedRequest: { include: { receivingDepartment: true } } },
      },
      pickupInstitution: true,
      destinationInstitution: true,
    },
  },
} as const;

type TripRow = Prisma.DispatchAssignmentGetPayload<{ include: typeof tripInclude }>;

/**
 * The crew app's side of a trip. Updates recorded offline arrive late, in the order they were made,
 * and each is judged against the transfer as it stands now: applied, accepted as already recorded,
 * or rejected with a reason the crew can understand.
 */
@Injectable()
export class CrewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async trips(auth: AuthContext): Promise<CrewTrip[]> {
    this.assertCrew(auth);
    const rows = await this.prisma.dispatchAssignment.findMany({
      where: {
        kind: 'PROVIDER',
        status: 'CONFIRMED',
        crew: { some: { crewMember: { userId: auth.userId } } },
        transfer: { status: { notIn: ['CANCELLED', 'COMPLETED'] } },
      },
      include: tripInclude,
      orderBy: { respondedAt: 'desc' },
    });
    return rows.filter((row) => this.canUpdate(auth, row)).map(toCrewTrip);
  }

  async sync(
    auth: AuthContext,
    input: CrewSyncInput,
    meta: RequestMeta,
  ): Promise<CrewSyncResponse> {
    this.assertCrew(auth);
    const statusResults: CrewSyncResult[] = [];
    // In order: a later press may depend on an earlier one in the same batch.
    for (const update of input.statusUpdates) {
      statusResults.push(await this.applyStatus(auth, update, meta));
    }
    const locationsAccepted = await this.storeLocations(auth, input.locations);
    return {
      statusResults,
      locationsAccepted,
      trips: await this.trips(auth),
      serverTime: new Date().toISOString(),
    };
  }

  private async applyStatus(
    auth: AuthContext,
    update: CrewStatusUpdate,
    meta: RequestMeta,
  ): Promise<CrewSyncResult> {
    const { clientId } = update;
    const seen = await this.prisma.transferEvent.findUnique({
      where: { clientId },
      include: { transfer: { select: { status: true } } },
    });
    if (seen) return { clientId, outcome: 'DUPLICATE', transferStatus: seen.transfer.status };

    const row = await this.prisma.dispatchAssignment.findUnique({
      where: { id: update.assignmentId },
      include: tripInclude,
    });
    const onCrew = row?.crew.some((c) => c.crewMember.userId === auth.userId);
    if (!row || !onCrew || !this.canUpdate(auth, row)) {
      return {
        clientId,
        outcome: 'REJECTED',
        reason: 'NOT_ON_TRIP',
        message:
          'You’re no longer on the crew for this trip. Your dispatcher changed the vehicle or crew.',
      };
    }
    const transfer = row.transfer;
    if (row.status !== 'CONFIRMED' || transfer.status === 'CANCELLED') {
      return {
        clientId,
        outcome: 'REJECTED',
        reason: 'TRIP_ENDED',
        transferStatus: transfer.status,
        message:
          transfer.status === 'CANCELLED'
            ? 'This transfer was cancelled.'
            : row.status === 'RELEASED'
              ? 'Your provider released this trip.'
              : 'This trip was taken back by the referring facility.',
      };
    }

    const decision = evaluateCrewUpdate(transfer.status, update.status);
    if (decision.outcome === 'ALREADY_RECORDED')
      return { clientId, outcome: 'ALREADY_RECORDED', transferStatus: transfer.status };
    if (decision.outcome === 'REJECTED') {
      return {
        clientId,
        outcome: 'REJECTED',
        reason: decision.reason === 'TRANSFER_ENDED' ? 'TRIP_ENDED' : 'INVALID_TRANSITION',
        transferStatus: transfer.status,
        message: `This trip is now “${TRANSFER_STATUS_LABELS[transfer.status]}”, so “${TRANSFER_STATUS_LABELS[update.status]}” can’t be recorded.`,
      };
    }

    const receivedAt = new Date();
    const deviceTime = new Date(update.occurredAt);
    // A clock far ahead would put the update in the future; use the time it arrived instead.
    const occurredAt =
      deviceTime.getTime() > receivedAt.getTime() + MAX_CLOCK_SKEW_MS ? receivedAt : deviceTime;
    const field = TIMESTAMP_FIELD[update.status];
    const type: TransferEventType =
      update.status === 'IN_TRANSIT' && transfer.status === 'INTERRUPTED'
        ? 'RESUMED'
        : update.status;

    try {
      const applied = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.transfer.updateMany({
          where: { id: transfer.id, status: transfer.status },
          data: { status: update.status, ...(field ? { [field]: occurredAt } : {}) },
        });
        if (count === 0) return false;
        await recordTransferEvent(tx, {
          transferId: transfer.id,
          type,
          actorId: auth.userId,
          institutionId: row.providerId,
          assignmentId: row.id,
          note: update.note ?? null,
          metadata: {
            deviceTime: update.occurredAt,
            ...(update.latitude != null
              ? { latitude: update.latitude, longitude: update.longitude }
              : {}),
          },
          at: occurredAt,
          source: 'CREW_APP',
          clientId,
        });
        await this.audit.record(
          {
            action: 'transfer.crew_status_updated',
            entityType: 'transfer',
            entityId: transfer.id,
            actorId: auth.userId,
            networkId: transfer.networkId,
            institutionId: row.providerId,
            metadata: {
              reference: transfer.referral.reference,
              status: update.status,
              delaySeconds: Math.round((receivedAt.getTime() - occurredAt.getTime()) / 1000),
            },
            meta,
          },
          tx,
        );
        return true;
      });
      // Someone else changed the transfer between reading and writing; judge the press again.
      if (!applied) return this.applyStatus(auth, update, meta);
    } catch (error) {
      if (isUniqueViolation(error)) return this.applyStatus(auth, update, meta);
      throw error;
    }
    return { clientId, outcome: 'APPLIED', transferStatus: update.status };
  }

  /**
   * Stores positions for trips the crew member is on. Duplicates (retried uploads) are skipped, and
   * the vehicle's last known position moves forward only.
   */
  private async storeLocations(auth: AuthContext, pings: LocationPing[]): Promise<number> {
    if (pings.length === 0) return 0;
    const assignmentIds = [...new Set(pings.map((p) => p.assignmentId))];
    const rows = await this.prisma.dispatchAssignment.findMany({
      where: {
        id: { in: assignmentIds },
        kind: 'PROVIDER',
        crew: { some: { crewMember: { userId: auth.userId } } },
      },
      include: { provider: true },
    });
    const limit = Date.now() + MAX_CLOCK_SKEW_MS;
    let accepted = 0;

    for (const row of rows) {
      if (!row.provider || !this.canUpdate(auth, { ...row, provider: row.provider })) continue;
      const since = (row.respondedAt ?? row.proposedAt).getTime() - MAX_CLOCK_SKEW_MS;
      const until = row.endedAt?.getTime() ?? limit;
      const valid = pings
        .filter((p) => p.assignmentId === row.id)
        .filter((p) => {
          const t = new Date(p.recordedAt).getTime();
          return t >= since && t <= until && t <= limit;
        });
      if (valid.length === 0) continue;

      const { count } = await this.prisma.locationPing.createMany({
        data: valid.map((p) => ({
          transferId: row.transferId,
          assignmentId: row.id,
          vehicleId: row.vehicleId,
          recordedById: auth.userId,
          latitude: p.latitude,
          longitude: p.longitude,
          accuracy: p.accuracy ?? null,
          speed: p.speed ?? null,
          heading: p.heading ?? null,
          recordedAt: new Date(p.recordedAt),
        })),
        skipDuplicates: true,
      });
      accepted += count;

      const latest = valid.reduce((a, b) => (a.recordedAt > b.recordedAt ? a : b));
      if (row.vehicleId && row.status === 'CONFIRMED') {
        const at = new Date(latest.recordedAt);
        await this.prisma.vehicle.updateMany({
          where: {
            id: row.vehicleId,
            OR: [{ lastLocationAt: null }, { lastLocationAt: { lt: at } }],
          },
          data: {
            lastLatitude: latest.latitude,
            lastLongitude: latest.longitude,
            lastLocationAt: at,
          },
        });
      }
    }
    return accepted;
  }

  private assertCrew(auth: AuthContext): void {
    if (!permissionSummary(auth.grants).includes('trip:update'))
      throw new ForbiddenException(NOT_PERMITTED);
  }

  private canUpdate(
    auth: AuthContext,
    row: { provider: Institution | null; providerId: string | null },
  ): boolean {
    return (
      !!row.provider &&
      hasPermission(auth.grants, 'trip:update', {
        networkId: row.provider.networkId,
        institutionId: row.provider.id,
      })
    );
  }
}

function place(i: Institution) {
  return {
    id: i.id,
    name: i.name,
    phone: i.phone,
    address: i.address,
    latitude: i.latitude,
    longitude: i.longitude,
  };
}

function toCrewTrip(row: TripRow): CrewTrip {
  const t = row.transfer;
  const department = t.referral.acceptedRequest?.receivingDepartment;
  return {
    assignmentId: row.id,
    transferId: t.id,
    reference: t.referral.reference,
    urgency: t.referral.urgency,
    status: t.status,
    nextStatus: nextCrewStatus(t.status),
    patient: {
      displayName: patientDisplayName(t.referral.patient),
      sex: t.referral.patient.sex,
      ageYears: patientAge(t.referral.patient),
    },
    pickup: place(t.pickupInstitution),
    destination: {
      ...place(t.destinationInstitution),
      department: department ? { name: department.name, phone: department.phone } : null,
    },
    requiredCapability: t.requiredCapability,
    requiredEquipment: t.requiredEquipment,
    notes: t.notes,
    readyAt: t.readyAt?.toISOString() ?? null,
    vehicle: row.vehicle
      ? { registration: row.vehicle.registration, callSign: row.vehicle.callSign }
      : null,
    crew: row.crew.map(({ crewMember: c }) => ({
      fullName: c.fullName,
      qualification: c.qualification,
    })),
    dispatcherPhone: row.provider?.phone ?? null,
    confirmedAt: row.respondedAt?.toISOString() ?? null,
    updatedAt: t.updatedAt.toISOString(),
  };
}
