import { type VehicleCandidate } from '@lifeline/domain';
import {
  type AssignmentView,
  type CrewMemberView,
  type TransferEventView,
  type VehicleRef,
  type VehicleView,
} from '@lifeline/schemas';
import {
  type CrewMember,
  type DispatchAssignment,
  type Institution,
  type TransferEvent,
  type User,
  type Vehicle,
} from '@prisma/client';

type Person = Pick<User, 'id' | 'fullName'>;
type Place = Pick<Institution, 'id' | 'name'>;

export const person = { select: { id: true, fullName: true } } as const;
export const place = { select: { id: true, name: true } } as const;
export const placeWithPhone = { select: { id: true, name: true, phone: true } } as const;

export function toVehicleRef(v: Vehicle): VehicleRef {
  return {
    id: v.id,
    registration: v.registration,
    callSign: v.callSign,
    capability: v.capability,
    equipment: v.equipment,
  };
}

/** Where distance estimates start: the vehicle's own base, else its provider's address. */
export function vehicleBase(
  v: Vehicle,
  provider: Pick<Institution, 'latitude' | 'longitude'>,
): { latitude: number; longitude: number } | null {
  if (v.baseLatitude != null && v.baseLongitude != null)
    return { latitude: v.baseLatitude, longitude: v.baseLongitude };
  if (provider.latitude != null && provider.longitude != null)
    return { latitude: provider.latitude, longitude: provider.longitude };
  return null;
}

export function toCandidate(
  v: Vehicle & { institution: Pick<Institution, 'latitude' | 'longitude'> },
  flags: { busy: boolean; offeredElsewhere: boolean },
): VehicleCandidate {
  return {
    id: v.id,
    capability: v.capability,
    equipment: v.equipment,
    status: v.status,
    statusUpdatedAt: v.statusUpdatedAt,
    base: vehicleBase(v, v.institution),
    lastPosition:
      v.lastLatitude != null && v.lastLongitude != null && v.lastLocationAt
        ? { latitude: v.lastLatitude, longitude: v.lastLongitude, at: v.lastLocationAt }
        : null,
    ...flags,
  };
}

export function toVehicleView(
  v: Vehicle & {
    institution: Institution;
    statusUpdatedBy: Person | null;
  },
  options: {
    staleAfterMinutes: number;
    onTransfer: { id: string; reference: string } | null;
    now?: Date;
  },
): VehicleView {
  const now = options.now ?? new Date();
  const base = vehicleBase(v, v.institution);
  return {
    id: v.id,
    provider: { id: v.institution.id, name: v.institution.name },
    registration: v.registration,
    callSign: v.callSign,
    capability: v.capability,
    equipment: v.equipment,
    status: v.status,
    statusNote: v.statusNote,
    statusUpdatedAt: v.statusUpdatedAt?.toISOString() ?? null,
    statusUpdatedBy: v.statusUpdatedBy
      ? { id: v.statusUpdatedBy.id, fullName: v.statusUpdatedBy.fullName }
      : null,
    stale:
      !v.statusUpdatedAt ||
      now.getTime() - v.statusUpdatedAt.getTime() > options.staleAfterMinutes * 60_000,
    base: base ? { name: v.baseName, ...base } : null,
    lastPosition:
      v.lastLatitude != null && v.lastLongitude != null && v.lastLocationAt
        ? {
            latitude: v.lastLatitude,
            longitude: v.lastLongitude,
            at: v.lastLocationAt.toISOString(),
          }
        : null,
    onTransfer: options.onTransfer,
    recordStatus: v.recordStatus,
  };
}

export function toCrewMemberView(
  c: CrewMember & { institution: Place; user: Pick<User, 'id' | 'email'> | null },
  onTransfer: boolean,
): CrewMemberView {
  return {
    id: c.id,
    provider: { id: c.institution.id, name: c.institution.name },
    fullName: c.fullName,
    phone: c.phone,
    qualification: c.qualification,
    account: c.user ? { id: c.user.id, email: c.user.email } : null,
    onTransfer,
    recordStatus: c.recordStatus,
  };
}

export const assignmentInclude = {
  provider: placeWithPhone,
  vehicle: true,
  proposedBy: person,
  respondedBy: person,
  crew: { include: { crewMember: true } },
} as const;

export type AssignmentRow = DispatchAssignment & {
  provider: (Place & { phone: string | null }) | null;
  vehicle: Vehicle | null;
  proposedBy: Person;
  respondedBy: Person | null;
  crew: { crewMember: CrewMember }[];
};

export function toAssignmentView(a: AssignmentRow): AssignmentView {
  return {
    id: a.id,
    kind: a.kind,
    status: a.status,
    provider: a.provider,
    vehicle: a.vehicle ? toVehicleRef(a.vehicle) : null,
    crew: a.crew.map(({ crewMember: c }) => ({
      id: c.id,
      fullName: c.fullName,
      qualification: c.qualification,
      phone: c.phone,
    })),
    proposedBy: a.proposedBy,
    proposedAt: a.proposedAt.toISOString(),
    respondedBy: a.respondedBy,
    respondedAt: a.respondedAt?.toISOString() ?? null,
    declineReason: a.declineReason,
    note: a.note,
    responseNote: a.responseNote,
    etaMinutes: a.etaMinutes,
    endedAt: a.endedAt?.toISOString() ?? null,
    endReason: a.endReason,
    external:
      a.kind === 'EXTERNAL' && a.externalService
        ? {
            service: a.externalService,
            providerName: a.externalProvider,
            vehicleRegistration: a.externalVehicle,
            contactPhone: a.externalPhone,
          }
        : null,
  };
}

export function toTransferEventView(
  e: TransferEvent & { actor: Person | null; institution: Place | null },
): TransferEventView {
  return {
    id: e.id,
    type: e.type,
    occurredAt: e.occurredAt.toISOString(),
    actor: e.actor,
    institution: e.institution,
    note: e.note,
  };
}
