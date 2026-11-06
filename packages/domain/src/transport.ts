import { estimateDriveMinutes, haversineKm, type LatLng } from './geo';

/**
 * Transport (Phase 3): ambulance capability, equipment, crews, the transfer status machine and the
 * rules for suggesting vehicles. Suggestions explain themselves and never assign anything: the person
 * arranging transport offers the trip to one vehicle and the provider confirms.
 */

/** Ordered from least to most capable; a vehicle meets any need at or below its own level. */
export const CAPABILITY_LEVELS = ['PATIENT_TRANSPORT', 'BLS', 'ALS', 'CRITICAL_CARE'] as const;
export type CapabilityLevel = (typeof CAPABILITY_LEVELS)[number];

export const CAPABILITY_LABELS: Record<CapabilityLevel, string> = {
  PATIENT_TRANSPORT: 'Patient transport',
  BLS: 'Basic life support',
  ALS: 'Advanced life support',
  CRITICAL_CARE: 'Critical care',
};

export const CAPABILITY_DESCRIPTIONS: Record<CapabilityLevel, string> = {
  PATIENT_TRANSPORT: 'Stable patient who needs a stretcher or seat but no treatment on the way.',
  BLS: 'Oxygen, first aid and monitoring by an emergency medical technician.',
  ALS: 'Paramedic or nurse with cardiac monitoring, defibrillation and IV drugs.',
  CRITICAL_CARE: 'Ventilated or unstable patient needing an intensive-care team on the way.',
};

export function meetsCapability(vehicle: CapabilityLevel, required: CapabilityLevel): boolean {
  return CAPABILITY_LEVELS.indexOf(vehicle) >= CAPABILITY_LEVELS.indexOf(required);
}

/**
 * A starting point only, shown pre-selected on the transport form. The clinician chooses the level;
 * urgency describes how soon, not what care is needed on the way.
 */
export const SUGGESTED_CAPABILITY: Record<'EMERGENCY' | 'URGENT' | 'ROUTINE', CapabilityLevel> = {
  EMERGENCY: 'ALS',
  URGENT: 'BLS',
  ROUTINE: 'PATIENT_TRANSPORT',
};

export const VEHICLE_EQUIPMENT = [
  { code: 'OXYGEN', name: 'Oxygen' },
  { code: 'SUCTION', name: 'Suction' },
  { code: 'CARDIAC_MONITOR', name: 'Cardiac monitor' },
  { code: 'DEFIBRILLATOR', name: 'Defibrillator' },
  { code: 'INFUSION_PUMP', name: 'Infusion pumps' },
  { code: 'VENTILATOR', name: 'Transport ventilator' },
  { code: 'INCUBATOR', name: 'Transport incubator' },
  { code: 'SPINAL_IMMOBILISATION', name: 'Spinal immobilisation' },
] as const;
export type EquipmentCode = (typeof VEHICLE_EQUIPMENT)[number]['code'];
export const EQUIPMENT_CODES = VEHICLE_EQUIPMENT.map((e) => e.code) as [
  EquipmentCode,
  ...EquipmentCode[],
];

export function equipmentName(code: string): string {
  return VEHICLE_EQUIPMENT.find((e) => e.code === code)?.name ?? code;
}

/**
 * What the provider says about a vehicle. Whether it is on a trip is not stored here: a vehicle with a
 * confirmed assignment is busy, whatever this says.
 */
export const VEHICLE_STATUSES = ['AVAILABLE', 'OUT_OF_SERVICE', 'OFF_DUTY'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  AVAILABLE: 'Available',
  OUT_OF_SERVICE: 'Out of service',
  OFF_DUTY: 'Off duty',
};

/** Default for networks: availability confirmed more than one 12-hour shift ago is stale. */
export const DEFAULT_VEHICLE_STATUS_STALE_MINUTES = 720;
/** A reported position older than this is ignored and the vehicle's base is used instead. */
export const LOCATION_FRESH_MINUTES = 30;

export const CREW_QUALIFICATIONS = [
  'DRIVER',
  'EMT',
  'PARAMEDIC',
  'NURSE',
  'CLINICAL_OFFICER',
  'DOCTOR',
] as const;
export type CrewQualification = (typeof CREW_QUALIFICATIONS)[number];

export const CREW_QUALIFICATION_LABELS: Record<CrewQualification, string> = {
  DRIVER: 'Driver',
  EMT: 'Emergency medical technician',
  PARAMEDIC: 'Paramedic',
  NURSE: 'Nurse',
  CLINICAL_OFFICER: 'Clinical officer',
  DOCTOR: 'Doctor',
};

// ---- Transfer status machine ----

/** Phase 3 moves transfers up to Dispatched; the crew app and handover (Phases 4–6) take them further. */
export const TRANSFER_STATUSES = [
  'AWAITING_TRANSPORT',
  'AMBULANCE_ASSIGNED',
  'DISPATCHED',
  'AT_PICKUP',
  'PATIENT_COLLECTED',
  'IN_TRANSIT',
  'ARRIVED',
  'HANDED_OVER',
  'COMPLETED',
  'INTERRUPTED',
  'CANCELLED',
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  AWAITING_TRANSPORT: 'Awaiting ambulance assignment',
  AMBULANCE_ASSIGNED: 'Ambulance assigned',
  DISPATCHED: 'Ambulance dispatched',
  AT_PICKUP: 'At pickup',
  PATIENT_COLLECTED: 'Patient collected',
  IN_TRANSIT: 'In transit',
  ARRIVED: 'Arrived',
  HANDED_OVER: 'Handed over',
  COMPLETED: 'Completed',
  INTERRUPTED: 'Interrupted',
  CANCELLED: 'Cancelled',
};

const TRANSITIONS: Record<TransferStatus, readonly TransferStatus[]> = {
  AWAITING_TRANSPORT: ['AMBULANCE_ASSIGNED', 'CANCELLED'],
  // Back to awaiting when the provider releases the trip or the arranger withdraws it.
  AMBULANCE_ASSIGNED: ['DISPATCHED', 'AWAITING_TRANSPORT', 'CANCELLED'],
  DISPATCHED: ['AT_PICKUP', 'AWAITING_TRANSPORT', 'CANCELLED'],
  AT_PICKUP: ['PATIENT_COLLECTED', 'CANCELLED'],
  PATIENT_COLLECTED: ['IN_TRANSIT', 'INTERRUPTED'],
  IN_TRANSIT: ['ARRIVED', 'INTERRUPTED'],
  ARRIVED: ['HANDED_OVER'],
  HANDED_OVER: ['COMPLETED'],
  // A breakdown or deterioration on the way: carry on, or another ambulance takes over.
  INTERRUPTED: ['IN_TRANSIT', 'AMBULANCE_ASSIGNED', 'ARRIVED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: TransferStatus, to: TransferStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Before the patient is collected the transfer can still be cancelled or given to another vehicle. */
export const PRE_COLLECTION_STATUSES: readonly TransferStatus[] = [
  'AWAITING_TRANSPORT',
  'AMBULANCE_ASSIGNED',
  'DISPATCHED',
  'AT_PICKUP',
];

export function isOpenTransfer(status: TransferStatus): boolean {
  return status !== 'COMPLETED' && status !== 'CANCELLED';
}

// ---- Crew updates (Phase 4) ----

/** Statuses the crew app can record. Handover and completion come with Phase 6. */
export const CREW_STATUSES = [
  'DISPATCHED',
  'AT_PICKUP',
  'PATIENT_COLLECTED',
  'IN_TRANSIT',
  'ARRIVED',
  'INTERRUPTED',
] as const;
export type CrewStatus = (typeof CREW_STATUSES)[number];

/** The journey as the crew moves through it, in order. */
export const CREW_JOURNEY: readonly CrewStatus[] = CREW_STATUSES.filter((s) => s !== 'INTERRUPTED');

/** Button labels in the crew app, for the next step from each status. */
export const CREW_ACTION_LABELS: Record<CrewStatus, string> = {
  DISPATCHED: 'On our way',
  AT_PICKUP: 'Arrived at pickup',
  PATIENT_COLLECTED: 'Patient on board',
  IN_TRANSIT: 'Leaving for destination',
  ARRIVED: 'Arrived at destination',
  INTERRUPTED: 'Report a problem',
};

const JOURNEY_ORDER: readonly TransferStatus[] = [
  'AMBULANCE_ASSIGNED',
  ...CREW_JOURNEY,
  'HANDED_OVER',
  'COMPLETED',
];

/** The crew's next forward step, or null when there is none for them to take. */
export function nextCrewStatus(current: TransferStatus): CrewStatus | null {
  if (current === 'INTERRUPTED') return 'IN_TRANSIT';
  const i = JOURNEY_ORDER.indexOf(current);
  const next = i >= 0 ? JOURNEY_ORDER[i + 1] : undefined;
  return next && (CREW_STATUSES as readonly string[]).includes(next) ? (next as CrewStatus) : null;
}

export type CrewUpdateDecision =
  | { outcome: 'APPLY' }
  /** Already reached, e.g. the dispatcher recorded it while the crew was offline. Not an error. */
  | { outcome: 'ALREADY_RECORDED' }
  | { outcome: 'REJECTED'; reason: 'INVALID_TRANSITION' | 'TRANSFER_ENDED' };

/**
 * Judges a crew update against the transfer's status on the server. Updates queued offline arrive
 * late and in order; one the server has already passed is accepted as a no-op rather than an error.
 */
export function evaluateCrewUpdate(
  current: TransferStatus,
  target: CrewStatus,
): CrewUpdateDecision {
  if (current === 'CANCELLED') return { outcome: 'REJECTED', reason: 'TRANSFER_ENDED' };
  if (target === 'INTERRUPTED') {
    if (current === 'INTERRUPTED') return { outcome: 'ALREADY_RECORDED' };
    return canTransition(current, target)
      ? { outcome: 'APPLY' }
      : { outcome: 'REJECTED', reason: 'INVALID_TRANSITION' };
  }
  if (canTransition(current, target)) return { outcome: 'APPLY' };
  const at = JOURNEY_ORDER.indexOf(current);
  const to = JOURNEY_ORDER.indexOf(target);
  if (at >= 0 && to >= 0 && at >= to) return { outcome: 'ALREADY_RECORDED' };
  return { outcome: 'REJECTED', reason: 'INVALID_TRANSITION' };
}

/** Device clocks drift; times further ahead than this are replaced with the time received. */
export const MAX_CLOCK_SKEW_MS = 5 * 60_000;

// ---- Dispatch assignments ----

export const ASSIGNMENT_STATUSES = [
  'PROPOSED',
  'CONFIRMED',
  'DECLINED',
  'WITHDRAWN',
  'RELEASED',
  'COMPLETED',
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  PROPOSED: 'Awaiting provider confirmation',
  CONFIRMED: 'Confirmed',
  DECLINED: 'Declined by provider',
  WITHDRAWN: 'Withdrawn',
  RELEASED: 'Released by provider',
  COMPLETED: 'Completed',
};

/** At most one assignment per transfer is open at a time; the database enforces it too. */
export const OPEN_ASSIGNMENT_STATUSES: readonly AssignmentStatus[] = ['PROPOSED', 'CONFIRMED'];

export const ASSIGNMENT_DECLINE_REASONS = [
  'NO_VEHICLE',
  'NO_CREW',
  'VEHICLE_UNSUITABLE',
  'TOO_FAR',
  'OTHER',
] as const;
export type AssignmentDeclineReason = (typeof ASSIGNMENT_DECLINE_REASONS)[number];

export const ASSIGNMENT_DECLINE_LABELS: Record<AssignmentDeclineReason, string> = {
  NO_VEHICLE: 'No suitable vehicle available now',
  NO_CREW: 'No crew available',
  VEHICLE_UNSUITABLE: 'Vehicle not suitable for this patient',
  TOO_FAR: 'Too far to reach in time',
  OTHER: 'Other',
};

/** Transport arranged outside Lifeline, recorded so everyone sees how the patient is travelling. */
export const EXTERNAL_TRANSPORT_SERVICES = ['NATIONAL_922', 'COUNTY_AMBULANCE', 'OTHER'] as const;
export type ExternalTransportService = (typeof EXTERNAL_TRANSPORT_SERVICES)[number];

export const EXTERNAL_TRANSPORT_LABELS: Record<ExternalTransportService, string> = {
  NATIONAL_922: '922 national dispatch',
  COUNTY_AMBULANCE: 'County ambulance (not on Lifeline)',
  OTHER: 'Other transport',
};

export const TRANSPORT_PAYERS = [
  'REFERRING_FACILITY',
  'RECEIVING_FACILITY',
  'COUNTY_GOVERNMENT',
  'NATIONAL_GOVERNMENT',
  'PATIENT_OR_FAMILY',
  'INSURER',
  'OTHER',
] as const;
export type TransportPayer = (typeof TRANSPORT_PAYERS)[number];

export const TRANSPORT_PAYER_LABELS: Record<TransportPayer, string> = {
  REFERRING_FACILITY: 'Referring facility',
  RECEIVING_FACILITY: 'Receiving facility',
  COUNTY_GOVERNMENT: 'County government',
  NATIONAL_GOVERNMENT: 'National government',
  PATIENT_OR_FAMILY: 'Patient or family',
  INSURER: 'Insurer',
  OTHER: 'Other',
};

// ---- Vehicle suggestions ----

export interface VehicleCandidate {
  id: string;
  capability: CapabilityLevel;
  equipment: readonly string[];
  status: VehicleStatus;
  /** When the provider last set or confirmed the status. Null if never. */
  statusUpdatedAt: Date | null;
  base: LatLng | null;
  lastPosition: (LatLng & { at: Date }) | null;
  /** On a confirmed assignment for another transfer. */
  busy: boolean;
  /** Offered for another transfer and awaiting the provider's answer. */
  offeredElsewhere: boolean;
}

export interface TransportNeed {
  capability: CapabilityLevel;
  equipment: readonly string[];
  pickup: LatLng | null;
}

export interface VehicleSuggestion {
  vehicleId: string;
  etaMinutes: number | null;
  distanceKm: number | null;
  /** Where the estimate starts from. */
  from: 'LAST_POSITION' | 'BASE' | null;
  reasons: string[];
  cautions: string[];
}

export interface VehicleExclusion {
  vehicleId: string;
  reasons: string[];
}

function minutesSince(date: Date, now: Date): number {
  return Math.round((now.getTime() - date.getTime()) / 60_000);
}

function describeAge(minutes: number): string {
  if (minutes < 60) return `${Math.max(minutes, 0)} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

/**
 * Filters vehicles by capability, equipment, availability and freshness, then ranks them by estimated
 * time to pickup. Vehicles already offered elsewhere go last, and over-qualified vehicles go after
 * equally close ones so critical-care ambulances stay free for patients who need them.
 */
export function rankVehicles(
  candidates: readonly VehicleCandidate[],
  need: TransportNeed,
  options: { now: Date; staleAfterMinutes: number },
): { suggestions: VehicleSuggestion[]; excluded: VehicleExclusion[] } {
  const { now, staleAfterMinutes } = options;
  const suggestions: (VehicleSuggestion & { surplus: number; offered: boolean })[] = [];
  const excluded: VehicleExclusion[] = [];

  for (const v of candidates) {
    const problems: string[] = [];
    if (v.busy) problems.push('On another transfer');
    else if (v.status !== 'AVAILABLE') problems.push(VEHICLE_STATUS_LABELS[v.status]);
    else if (!v.statusUpdatedAt) problems.push('Availability never confirmed by the provider');
    else if (minutesSince(v.statusUpdatedAt, now) > staleAfterMinutes)
      problems.push(
        `Availability last confirmed ${describeAge(minutesSince(v.statusUpdatedAt, now))}`,
      );
    if (!meetsCapability(v.capability, need.capability))
      problems.push(`${CAPABILITY_LABELS[v.capability]} only`);
    const missing = need.equipment.filter((code) => !v.equipment.includes(code));
    if (missing.length) problems.push(`No ${missing.map(equipmentName).join(', ').toLowerCase()}`);

    if (problems.length) {
      excluded.push({ vehicleId: v.id, reasons: problems });
      continue;
    }

    const positionFresh =
      v.lastPosition && minutesSince(v.lastPosition.at, now) <= LOCATION_FRESH_MINUTES;
    const origin = positionFresh ? v.lastPosition : v.base;
    const from = positionFresh ? 'LAST_POSITION' : v.base ? 'BASE' : null;
    const distanceKm = origin && need.pickup ? haversineKm(origin, need.pickup) : null;
    const etaMinutes = distanceKm === null ? null : estimateDriveMinutes(distanceKm);
    const surplus =
      CAPABILITY_LEVELS.indexOf(v.capability) - CAPABILITY_LEVELS.indexOf(need.capability);

    const reasons = [
      surplus === 0
        ? `${CAPABILITY_LABELS[v.capability]}, as needed`
        : `${CAPABILITY_LABELS[v.capability]}, meets the need`,
    ];
    if (need.equipment.length)
      reasons.push(`Carries ${need.equipment.map(equipmentName).join(', ').toLowerCase()}`);
    if (etaMinutes !== null)
      reasons.push(
        `About ${etaMinutes} min to pickup from ${from === 'BASE' ? 'its base' : 'its last reported position'} (estimate)`,
      );
    reasons.push(`Availability confirmed ${describeAge(minutesSince(v.statusUpdatedAt!, now))}`);

    const cautions: string[] = [];
    if (v.offeredElsewhere) cautions.push('Already offered for another transfer');
    if (surplus > 0) cautions.push('Higher level than needed');
    if (etaMinutes === null) cautions.push('Location unknown; time to pickup can’t be estimated');

    suggestions.push({
      vehicleId: v.id,
      etaMinutes,
      distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
      from,
      reasons,
      cautions,
      surplus,
      offered: v.offeredElsewhere,
    });
  }

  suggestions.sort(
    (a, b) =>
      Number(a.offered) - Number(b.offered) ||
      (a.etaMinutes ?? Number.POSITIVE_INFINITY) - (b.etaMinutes ?? Number.POSITIVE_INFINITY) ||
      a.surplus - b.surplus,
  );
  return {
    suggestions: suggestions.map(({ surplus: _s, offered: _o, ...s }) => s),
    excluded,
  };
}
