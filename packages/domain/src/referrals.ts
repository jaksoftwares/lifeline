/**
 * Referral lifecycle (Phase 2). Transfer states (ambulance assigned, collected, …) follow in Phase 3+.
 *
 * A referral is sent as one request per receiving facility. Each facility answers its own request; the
 * first acceptance decides the destination and withdraws the others.
 */
export const REFERRAL_STATUSES = ['DRAFT', 'SUBMITTED', 'ACCEPTED', 'CANCELLED'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Awaiting receiving-facility response',
  ACCEPTED: 'Accepted',
  CANCELLED: 'Cancelled',
};

export const REQUEST_STATUSES = [
  'PENDING',
  'INFO_REQUESTED',
  'ACCEPTED',
  'DECLINED',
  'WITHDRAWN',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: 'Awaiting response',
  INFO_REQUESTED: 'More information required',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  WITHDRAWN: 'Withdrawn',
};

export const OPEN_REQUEST_STATUSES: readonly RequestStatus[] = ['PENDING', 'INFO_REQUESTED'];

export function isOpenRequest(status: RequestStatus): boolean {
  return OPEN_REQUEST_STATUSES.includes(status);
}

/** A receiving facility can respond while its request is open and the referral is still looking for a destination. */
export function canRespondToRequest(referral: ReferralStatus, request: RequestStatus): boolean {
  return referral === 'SUBMITTED' && isOpenRequest(request);
}

export const MAX_RECEIVING_FACILITIES = 5;

export const URGENCIES = ['EMERGENCY', 'URGENT', 'ROUTINE'] as const;
export type Urgency = (typeof URGENCIES)[number];

export const URGENCY_LABELS: Record<Urgency, string> = {
  EMERGENCY: 'Emergency',
  URGENT: 'Urgent',
  ROUTINE: 'Routine',
};

export const URGENCY_DESCRIPTIONS: Record<Urgency, string> = {
  EMERGENCY: 'Immediate threat to life or limb; needs transfer now.',
  URGENT: 'Needs specialist care within hours.',
  ROUTINE: 'Planned transfer; condition is stable.',
};

export const DECLINE_REASONS = [
  'NO_BED',
  'NO_SPECIALIST',
  'NO_EQUIPMENT',
  'SERVICE_NOT_OFFERED',
  'CLINICALLY_INAPPROPRIATE',
  'OTHER',
] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

export const DECLINE_REASON_LABELS: Record<DeclineReason, string> = {
  NO_BED: 'No suitable bed available',
  NO_SPECIALIST: 'Specialist not available',
  NO_EQUIPMENT: 'Equipment not available',
  SERVICE_NOT_OFFERED: 'Service not offered here',
  CLINICALLY_INAPPROPRIATE: 'Not clinically appropriate for this facility',
  OTHER: 'Other',
};

export const SEXES = ['FEMALE', 'MALE', 'INTERSEX', 'UNKNOWN'] as const;
export type Sex = (typeof SEXES)[number];

export const SEX_LABELS: Record<Sex, string> = {
  FEMALE: 'Female',
  MALE: 'Male',
  INTERSEX: 'Intersex',
  UNKNOWN: 'Not known',
};

export const PREGNANCY_STATUSES = [
  'NOT_PREGNANT',
  'PREGNANT',
  'POSTPARTUM',
  'UNKNOWN',
  'NOT_APPLICABLE',
] as const;
export type PregnancyStatus = (typeof PREGNANCY_STATUSES)[number];

export const PREGNANCY_LABELS: Record<PregnancyStatus, string> = {
  NOT_PREGNANT: 'Not pregnant',
  PREGNANT: 'Pregnant',
  POSTPARTUM: 'Postpartum (within 6 weeks)',
  UNKNOWN: 'Not known',
  NOT_APPLICABLE: 'Not applicable',
};

export const AGE_UNITS = ['YEARS', 'MONTHS', 'DAYS'] as const;
export type AgeUnit = (typeof AGE_UNITS)[number];

/** Age in years (fractional) from a date of birth or an estimate; null when neither is known. */
export function ageInYears(
  patient: {
    dateOfBirth?: string | Date | null;
    estimatedAge?: number | null;
    estimatedAgeUnit?: AgeUnit | null;
  },
  now: Date = new Date(),
): number | null {
  if (patient.dateOfBirth) {
    return (now.getTime() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000);
  }
  if (patient.estimatedAge == null || !patient.estimatedAgeUnit) return null;
  const divisor = { YEARS: 1, MONTHS: 12, DAYS: 365.25 }[patient.estimatedAgeUnit];
  return patient.estimatedAge / divisor;
}

/** "34 y", "7 mo", "12 d" — compact age for lists. */
export function formatAge(years: number | null): string {
  if (years === null) return 'Age not known';
  if (years >= 2) return `${Math.floor(years)} y`;
  const months = years * 12;
  if (months >= 1) return `${Math.floor(months)} mo`;
  return `${Math.max(0, Math.floor(years * 365.25))} d`;
}
