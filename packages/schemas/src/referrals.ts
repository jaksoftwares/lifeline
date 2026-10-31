import {
  AGE_UNITS,
  type AgeUnit,
  CONSCIOUSNESS_LEVELS,
  type Consciousness,
  DECLINE_REASONS,
  type DeclineReason,
  type EarlyWarningScore,
  MAX_RECEIVING_FACILITIES,
  PREGNANCY_STATUSES,
  type PregnancyStatus,
  REFERRAL_STATUSES,
  type ReferralStatus,
  type RequestStatus,
  type ScoreBand,
  SEXES,
  type Sex,
  URGENCIES,
  type Urgency,
  VITAL_LIMITS,
} from '@lifeline/domain';
import { z } from 'zod';
import { kenyanPhoneNumberSchema, type ServiceView } from './facilities';

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no more than ${max} characters.`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.')
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v) <= new Date(),
    'Date of birth can’t be in the future.',
  );

export const patientInputSchema = z
  .object({
    /** Leave empty for an unidentified patient. */
    fullName: text(120),
    sex: z.enum(SEXES),
    dateOfBirth: isoDate.nullable().optional(),
    estimatedAge: z.number().int().min(0).max(130).nullable().optional(),
    estimatedAgeUnit: z.enum(AGE_UNITS).nullable().optional(),
    nationalId: text(20),
    shaNumber: text(30),
    hospitalNumber: text(30),
    nextOfKinName: text(120),
    nextOfKinPhone: kenyanPhoneNumberSchema
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
  })
  .superRefine((p, ctx) => {
    if (p.estimatedAge != null && !p.estimatedAgeUnit) {
      ctx.addIssue({
        code: 'custom',
        path: ['estimatedAgeUnit'],
        message: 'Choose years, months or days.',
      });
    }
  });
export type PatientInput = z.infer<typeof patientInputSchema>;

const clinicalFields = {
  pregnancyStatus: z.enum(PREGNANCY_STATUSES).nullable().optional(),
  gestationWeeks: z.number().int().min(1).max(45).nullable().optional(),
  reason: text(1000),
  clinicalSummary: text(4000),
  provisionalDiagnosis: text(500),
  treatmentGiven: text(2000),
  allergies: text(500),
  urgency: z.enum(URGENCIES).nullable().optional(),
  requiredServiceIds: z.array(z.string().min(1)).max(20).optional(),
};

export const createReferralSchema = z.object({
  referringInstitutionId: z.string().min(1),
  patient: patientInputSchema,
  ...clinicalFields,
});
export type CreateReferralInput = z.infer<typeof createReferralSchema>;

export const updateReferralDraftSchema = z.object({
  patient: patientInputSchema.optional(),
  ...clinicalFields,
});
export type UpdateReferralDraftInput = z.infer<typeof updateReferralDraftSchema>;

const vital = (key: keyof typeof VITAL_LIMITS, integer = true) => {
  const [min, max] = VITAL_LIMITS[key];
  const base = integer ? z.number().int('Use a whole number.') : z.number();
  return base
    .min(min, `Check this value; it should be between ${min} and ${max}.`)
    .max(max, `Check this value; it should be between ${min} and ${max}.`)
    .nullable()
    .optional();
};

export const vitalsInputSchema = z.object({
  observedAt: z
    .string()
    .datetime({ offset: true })
    .refine(
      (v) => new Date(v).getTime() <= Date.now() + 5 * 60_000,
      'Observation time can’t be in the future.',
    )
    .optional(),
  respiratoryRate: vital('respiratoryRate'),
  oxygenSaturation: vital('oxygenSaturation'),
  onSupplementalOxygen: z.boolean().nullable().optional(),
  systolicBp: vital('systolicBp'),
  diastolicBp: vital('diastolicBp'),
  heartRate: vital('heartRate'),
  temperature: vital('temperature', false),
  consciousness: z.enum(CONSCIOUSNESS_LEVELS).nullable().optional(),
  bloodGlucose: z.number().min(0.5).max(50).nullable().optional(),
  notes: text(1000),
});
export type VitalsInput = z.infer<typeof vitalsInputSchema>;

const facilityIds = z
  .array(z.string().min(1))
  .min(1, 'Choose at least one receiving facility.')
  .max(
    MAX_RECEIVING_FACILITIES,
    `Send to no more than ${MAX_RECEIVING_FACILITIES} facilities at once.`,
  )
  .refine((ids) => new Set(ids).size === ids.length, 'Each facility can be chosen once.');

export const submitReferralSchema = z.object({ institutionIds: facilityIds });
export const addRequestsSchema = z.object({ institutionIds: facilityIds });

export const respondToRequestSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('ACCEPT'),
    note: text(1000),
    receivingDepartmentId: z.string().min(1).nullable().optional(),
    readyAt: z.string().datetime({ offset: true }).nullable().optional(),
  }),
  z
    .object({
      decision: z.literal('DECLINE'),
      declineReason: z.enum(DECLINE_REASONS),
      note: text(1000),
    })
    .refine((v) => v.declineReason !== 'OTHER' || !!v.note, {
      path: ['note'],
      message: 'Explain why the referral is declined.',
    }),
  z.object({
    decision: z.literal('REQUEST_INFO'),
    question: z.string().trim().min(5, 'Say what information you need.').max(1000),
  }),
]);
export type RespondToRequestInput = z.infer<typeof respondToRequestSchema>;

export const reasonSchema = z.object({
  reason: z.string().trim().min(3, 'Give a short reason.').max(500),
});

export const messageInputSchema = z.object({
  body: z.string().trim().min(1, 'Write a message.').max(2000),
});

export const listReferralsQuerySchema = z.object({
  networkId: z.string().min(1),
  /** outgoing: sent by my facilities; incoming: requests to my facilities; network: everything (operations). */
  box: z.enum(['outgoing', 'incoming', 'network']),
  status: z.enum(REFERRAL_STATUSES).optional(),
  /** Only referrals still needing someone's attention. */
  open: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type ListReferralsQuery = z.infer<typeof listReferralsQuerySchema>;

// ---- Responses ----

export interface PatientView {
  id: string;
  fullName: string | null;
  sex: Sex;
  dateOfBirth: string | null;
  estimatedAge: number | null;
  estimatedAgeUnit: AgeUnit | null;
  /** Calculated age in years, or null. */
  ageYears: number | null;
  nationalId: string | null;
  shaNumber: string | null;
  hospitalNumber: string | null;
  nextOfKinName: string | null;
  nextOfKinPhone: string | null;
}

export interface RequestSummary {
  id: string;
  institution: { id: string; name: string };
  status: RequestStatus;
  sentAt: string;
  respondedAt: string | null;
}

export interface ReferralSummary {
  id: string;
  reference: string;
  status: ReferralStatus;
  urgency: Urgency | null;
  patient: { displayName: string; sex: Sex; ageYears: number | null };
  referringInstitution: { id: string; name: string };
  createdBy: { id: string; fullName: string };
  createdAt: string;
  submittedAt: string | null;
  updatedAt: string;
  requests: RequestSummary[];
  acceptedBy: { id: string; name: string } | null;
  /** What the viewer is expected to do next, if anything. */
  nextAction: string | null;
}

export interface AssessmentView {
  id: string;
  observedAt: string;
  recordedBy: { id: string; fullName: string };
  respiratoryRate: number | null;
  oxygenSaturation: number | null;
  onSupplementalOxygen: boolean | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  heartRate: number | null;
  temperature: number | null;
  consciousness: Consciousness | null;
  bloodGlucose: number | null;
  notes: string | null;
  score: {
    type: Exclude<EarlyWarningScore, 'NONE'>;
    total: number | null;
    band: ScoreBand | null;
    /** Points per observation, recalculated from the stored values for highlighting. */
    points: Partial<Record<string, number>>;
  } | null;
  scoreNote: string | null;
}

export interface AttachmentView {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: { id: string; fullName: string };
  uploadedByInstitution: { id: string; name: string };
  createdAt: string;
}

export interface MessageView {
  id: string;
  kind: 'NOTE' | 'INFO_REQUEST' | 'INFO_RESPONSE';
  body: string;
  author: { id: string; fullName: string };
  institution: { id: string; name: string };
  createdAt: string;
}

export interface RequestView extends RequestSummary {
  sentBy: { id: string; fullName: string };
  respondedBy: { id: string; fullName: string } | null;
  declineReason: DeclineReason | null;
  responseNote: string | null;
  receivingDepartment: { id: string; name: string; phone: string | null } | null;
  readyAt: string | null;
  withdrawnAt: string | null;
  withdrawReason: string | null;
  institutionPhone: string | null;
  messages: MessageView[];
  /** Departments the receiving facility can name when accepting (only for its own staff). */
  departments?: { id: string; name: string }[];
}

export interface ReferralEventView {
  id: string;
  type: string;
  occurredAt: string;
  actor: { id: string; fullName: string } | null;
  institution: { id: string; name: string } | null;
  note: string | null;
}

export interface ReferralDetail {
  id: string;
  reference: string;
  networkId: string;
  status: ReferralStatus;
  urgency: Urgency | null;
  referringInstitution: { id: string; name: string; phone: string | null };
  createdBy: { id: string; fullName: string };
  createdAt: string;
  submittedAt: string | null;
  acceptedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  patient: PatientView;
  pregnancyStatus: PregnancyStatus | null;
  gestationWeeks: number | null;
  reason: string | null;
  clinicalSummary: string | null;
  provisionalDiagnosis: string | null;
  treatmentGiven: string | null;
  allergies: string | null;
  requiredServices: ServiceView[];
  assessments: AssessmentView[];
  attachments: AttachmentView[];
  /** The receiving side sees only its own request. */
  requests: RequestView[];
  events: ReferralEventView[];
  scoring: { score: EarlyWarningScore; notApplicableReason: string | null };
  viewer: {
    /** The viewer can act for the referring facility (edit draft, submit, withdraw, cancel). */
    isReferrer: boolean;
    /** Requests the viewer can answer for their facility. */
    respondableRequestIds: string[];
    /** Requests whose thread the viewer can post in. */
    messageableRequestIds: string[];
  };
}
