import { type PregnancyStatus } from './referrals';

/**
 * Early-warning scores. These support clinical judgement and never replace it: the clinician's own
 * urgency rating is always recorded separately. A network chooses one score (or none) only after its
 * clinical governance group has approved it.
 *
 * - MEWS: Subbe CP et al., QJM 2001;94:521-6.
 * - NEWS2: Royal College of Physicians, 2017 (SpO2 scale 1 only; scale 2 needs a clinician decision).
 *
 * Neither is validated for pregnancy, the postpartum period or children, so they are not calculated there.
 */
export const EARLY_WARNING_SCORES = ['NONE', 'MEWS', 'NEWS2'] as const;
export type EarlyWarningScore = (typeof EARLY_WARNING_SCORES)[number];

export const EARLY_WARNING_SCORE_LABELS: Record<EarlyWarningScore, string> = {
  NONE: 'Not used',
  MEWS: 'MEWS',
  NEWS2: 'NEWS2',
};

/** ACVPU: Alert, new Confusion, responds to Voice, responds to Pain, Unresponsive. */
export const CONSCIOUSNESS_LEVELS = [
  'ALERT',
  'CONFUSION',
  'VOICE',
  'PAIN',
  'UNRESPONSIVE',
] as const;
export type Consciousness = (typeof CONSCIOUSNESS_LEVELS)[number];

export const CONSCIOUSNESS_LABELS: Record<Consciousness, string> = {
  ALERT: 'Alert',
  CONFUSION: 'New confusion',
  VOICE: 'Responds to voice',
  PAIN: 'Responds to pain',
  UNRESPONSIVE: 'Unresponsive',
};

export interface Vitals {
  respiratoryRate?: number | null;
  oxygenSaturation?: number | null;
  onSupplementalOxygen?: boolean | null;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  heartRate?: number | null;
  temperature?: number | null;
  consciousness?: Consciousness | null;
}

export type VitalParameter = Exclude<keyof Vitals, 'diastolicBp'>;

export const VITAL_LABELS: Record<keyof Vitals, string> = {
  respiratoryRate: 'Respiratory rate',
  oxygenSaturation: 'Oxygen saturation',
  onSupplementalOxygen: 'Supplemental oxygen',
  systolicBp: 'Systolic blood pressure',
  diastolicBp: 'Diastolic blood pressure',
  heartRate: 'Heart rate',
  temperature: 'Temperature',
  consciousness: 'Level of consciousness',
};

export type ScoreBand = 'LOW' | 'LOW_MEDIUM' | 'MEDIUM' | 'HIGH';

export const SCORE_BAND_LABELS: Record<ScoreBand, string> = {
  LOW: 'Low',
  LOW_MEDIUM: 'Low–medium',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

export interface ScoreResult {
  score: Exclude<EarlyWarningScore, 'NONE'>;
  /** Null when any required observation is missing; a partial total would understate risk. */
  total: number | null;
  band: ScoreBand | null;
  missing: VitalParameter[];
  /** Points per observation, for highlighting abnormal values. */
  points: Partial<Record<VitalParameter, number>>;
}

type Band = [max: number, points: number];
/** First band whose upper limit is >= value. */
const banded = (value: number, bands: Band[]): number => bands.find(([max]) => value <= max)![1];

const MEWS_RULES = {
  systolicBp: (v: number) =>
    banded(v, [
      [70, 3],
      [80, 2],
      [100, 1],
      [199, 0],
      [Infinity, 2],
    ]),
  heartRate: (v: number) =>
    banded(v, [
      [40, 2],
      [50, 1],
      [100, 0],
      [110, 1],
      [129, 2],
      [Infinity, 3],
    ]),
  respiratoryRate: (v: number) =>
    banded(v, [
      [8, 2],
      [14, 0],
      [20, 1],
      [29, 2],
      [Infinity, 3],
    ]),
  temperature: (v: number) =>
    banded(v, [
      [34.9, 2],
      [38.4, 0],
      [Infinity, 2],
    ]),
  // MEWS predates "new confusion"; it is scored as responding to voice pending local governance.
  consciousness: (v: Consciousness) =>
    ({ ALERT: 0, CONFUSION: 1, VOICE: 1, PAIN: 2, UNRESPONSIVE: 3 })[v],
};

const NEWS2_RULES = {
  respiratoryRate: (v: number) =>
    banded(v, [
      [8, 3],
      [11, 1],
      [20, 0],
      [24, 2],
      [Infinity, 3],
    ]),
  oxygenSaturation: (v: number) =>
    banded(v, [
      [91, 3],
      [93, 2],
      [95, 1],
      [Infinity, 0],
    ]),
  onSupplementalOxygen: (v: boolean) => (v ? 2 : 0),
  systolicBp: (v: number) =>
    banded(v, [
      [90, 3],
      [100, 2],
      [110, 1],
      [219, 0],
      [Infinity, 3],
    ]),
  heartRate: (v: number) =>
    banded(v, [
      [40, 3],
      [50, 1],
      [90, 0],
      [110, 1],
      [130, 2],
      [Infinity, 3],
    ]),
  temperature: (v: number) =>
    banded(v, [
      [35.0, 3],
      [36.0, 1],
      [38.0, 0],
      [39.0, 1],
      [Infinity, 2],
    ]),
  consciousness: (v: Consciousness) => (v === 'ALERT' ? 0 : 3),
};

export const SCORE_PARAMETERS: Record<Exclude<EarlyWarningScore, 'NONE'>, VitalParameter[]> = {
  MEWS: Object.keys(MEWS_RULES) as VitalParameter[],
  NEWS2: Object.keys(NEWS2_RULES) as VitalParameter[],
};

export function calculateScore(
  score: Exclude<EarlyWarningScore, 'NONE'>,
  vitals: Vitals,
): ScoreResult {
  const rules = (score === 'MEWS' ? MEWS_RULES : NEWS2_RULES) as Partial<
    Record<VitalParameter, (v: never) => number>
  >;
  const points: Partial<Record<VitalParameter, number>> = {};
  const missing: VitalParameter[] = [];

  for (const parameter of SCORE_PARAMETERS[score]) {
    const value = vitals[parameter];
    if (value === null || value === undefined) missing.push(parameter);
    else points[parameter] = rules[parameter]!(value as never);
  }

  if (missing.length) return { score, total: null, band: null, missing, points };
  const total = Object.values(points).reduce((a, b) => a + b, 0);
  return { score, total, band: bandFor(score, total, points), missing, points };
}

function bandFor(
  score: Exclude<EarlyWarningScore, 'NONE'>,
  total: number,
  points: ScoreResult['points'],
): ScoreBand {
  if (score === 'NEWS2') {
    if (total >= 7) return 'HIGH';
    if (total >= 5) return 'MEDIUM';
    return Object.values(points).some((p) => p === 3) ? 'LOW_MEDIUM' : 'LOW';
  }
  // MEWS: 5 or more was associated with higher risk of death and ICU admission (Subbe 2001).
  if (total >= 5) return 'HIGH';
  return total >= 3 ? 'MEDIUM' : 'LOW';
}

/** Why a score can't be used for this patient, or null if it can. */
export function scoreNotApplicableReason(patient: {
  ageYears: number | null;
  pregnancyStatus: PregnancyStatus | null;
}): string | null {
  if (patient.pregnancyStatus === 'PREGNANT' || patient.pregnancyStatus === 'POSTPARTUM') {
    return 'Not calculated: this score is not validated in pregnancy or the postpartum period. Use an obstetric early-warning chart.';
  }
  if (patient.ageYears === null)
    return 'Not calculated: the patient’s age is needed to confirm the score applies.';
  if (patient.ageYears < 16) {
    return 'Not calculated: this score is not validated for under-16s. Use a paediatric early-warning chart.';
  }
  return null;
}

/** Plausible physiological ranges; values outside are almost certainly entry errors. */
export const VITAL_LIMITS: Record<
  Exclude<keyof Vitals, 'onSupplementalOxygen' | 'consciousness'>,
  [number, number]
> = {
  respiratoryRate: [0, 80],
  oxygenSaturation: [50, 100],
  systolicBp: [30, 300],
  diastolicBp: [10, 200],
  heartRate: [0, 300],
  temperature: [25, 45],
};
