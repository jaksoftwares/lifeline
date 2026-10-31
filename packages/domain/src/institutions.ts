export const INSTITUTION_TYPES = ['FACILITY', 'AMBULANCE_PROVIDER'] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

export const INSTITUTION_TYPE_LABELS: Record<InstitutionType, string> = {
  FACILITY: 'Healthcare facility',
  AMBULANCE_PROVIDER: 'Ambulance provider',
};

/** Kenya Essential Package for Health (KEPH) facility levels. */
export const FACILITY_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type FacilityLevel = (typeof FACILITY_LEVELS)[number];
