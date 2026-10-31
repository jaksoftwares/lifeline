import { ageInYears, calculateScore, isOpenRequest, type ScoreBand } from '@lifeline/domain';
import {
  type AssessmentView,
  type AttachmentView,
  type MessageView,
  type PatientView,
  type ReferralEventView,
  type ReferralSummary,
  type RequestSummary,
} from '@lifeline/schemas';
import {
  type ClinicalAssessment,
  type Institution,
  type Patient,
  type Referral,
  type ReferralEvent,
  type ReferralMessage,
  type ReferralRequest,
  type User,
} from '@prisma/client';

type Person = Pick<User, 'id' | 'fullName'>;
const person = (u: Person) => ({ id: u.id, fullName: u.fullName });
const place = (i: Pick<Institution, 'id' | 'name'>) => ({ id: i.id, name: i.name });

export function patientAge(patient: Patient, now = new Date()): number | null {
  return ageInYears(
    {
      dateOfBirth: patient.dateOfBirth,
      estimatedAge: patient.estimatedAge,
      estimatedAgeUnit: patient.estimatedAgeUnit,
    },
    now,
  );
}

export function patientDisplayName(patient: Patient): string {
  return patient.fullName ?? 'Unidentified patient';
}

export function toPatientView(patient: Patient): PatientView {
  return {
    id: patient.id,
    fullName: patient.fullName,
    sex: patient.sex,
    dateOfBirth: patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    estimatedAge: patient.estimatedAge,
    estimatedAgeUnit: patient.estimatedAgeUnit,
    ageYears: patientAge(patient),
    nationalId: patient.nationalId,
    shaNumber: patient.shaNumber,
    hospitalNumber: patient.hospitalNumber,
    nextOfKinName: patient.nextOfKinName,
    nextOfKinPhone: patient.nextOfKinPhone,
  };
}

export type RequestWithInstitution = ReferralRequest & {
  institution: Pick<Institution, 'id' | 'name'>;
};

export function toRequestSummary(request: RequestWithInstitution): RequestSummary {
  return {
    id: request.id,
    institution: place(request.institution),
    status: request.status,
    sentAt: request.sentAt.toISOString(),
    respondedAt: request.respondedAt?.toISOString() ?? null,
  };
}

export type ReferralForSummary = Referral & {
  patient: Patient;
  referringInstitution: Pick<Institution, 'id' | 'name'>;
  createdBy: Person;
  requests: RequestWithInstitution[];
};

/**
 * What the viewer should do next. Referrers act on drafts, information requests and referrals that
 * every facility has turned down; receiving facilities act on requests awaiting their answer.
 */
export function nextAction(
  referral: ReferralForSummary,
  viewer: { isReferrer: boolean; respondableRequestIds: string[] },
): string | null {
  if (referral.status === 'DRAFT') return viewer.isReferrer ? 'Finish and send' : null;
  if (referral.status !== 'SUBMITTED') return null;
  const mine = referral.requests.filter((r) => viewer.respondableRequestIds.includes(r.id));
  if (mine.some((r) => r.status === 'PENDING')) return 'Respond to request';
  if (!viewer.isReferrer) return null;
  if (referral.requests.some((r) => r.status === 'INFO_REQUESTED'))
    return 'Answer information request';
  if (!referral.requests.some((r) => isOpenRequest(r.status))) return 'Send to another facility';
  return null;
}

export function toReferralSummary(
  referral: ReferralForSummary,
  visibleRequests: RequestWithInstitution[],
  action: string | null,
): ReferralSummary {
  const accepted = referral.requests.find((r) => r.id === referral.acceptedRequestId);
  return {
    id: referral.id,
    reference: referral.reference,
    status: referral.status,
    urgency: referral.urgency,
    patient: {
      displayName: patientDisplayName(referral.patient),
      sex: referral.patient.sex,
      ageYears: patientAge(referral.patient),
    },
    referringInstitution: place(referral.referringInstitution),
    createdBy: person(referral.createdBy),
    createdAt: referral.createdAt.toISOString(),
    submittedAt: referral.submittedAt?.toISOString() ?? null,
    updatedAt: referral.updatedAt.toISOString(),
    requests: visibleRequests.map(toRequestSummary),
    acceptedBy: accepted ? place(accepted.institution) : null,
    nextAction: action,
  };
}

export function toAssessmentView(a: ClinicalAssessment & { recordedBy: Person }): AssessmentView {
  const scoreType = a.scoreType && a.scoreType !== 'NONE' ? a.scoreType : null;
  return {
    id: a.id,
    observedAt: a.observedAt.toISOString(),
    recordedBy: person(a.recordedBy),
    respiratoryRate: a.respiratoryRate,
    oxygenSaturation: a.oxygenSaturation,
    onSupplementalOxygen: a.onSupplementalOxygen,
    systolicBp: a.systolicBp,
    diastolicBp: a.diastolicBp,
    heartRate: a.heartRate,
    temperature: a.temperature,
    consciousness: a.consciousness,
    bloodGlucose: a.bloodGlucose,
    notes: a.notes,
    score: scoreType
      ? {
          type: scoreType,
          total: a.scoreTotal,
          band: a.scoreBand as ScoreBand | null,
          points: calculateScore(scoreType, a).points,
        }
      : null,
    scoreNote: a.scoreNote,
  };
}

export function toMessageView(
  m: ReferralMessage & { author: Person; authorInstitution: Pick<Institution, 'id' | 'name'> },
): MessageView {
  return {
    id: m.id,
    kind: m.kind,
    body: m.body,
    author: person(m.author),
    institution: place(m.authorInstitution),
    createdAt: m.createdAt.toISOString(),
  };
}

export function toEventView(
  e: ReferralEvent & { actor: Person | null; institution: Pick<Institution, 'id' | 'name'> | null },
): ReferralEventView {
  return {
    id: e.id,
    type: e.type,
    occurredAt: e.occurredAt.toISOString(),
    actor: e.actor ? person(e.actor) : null,
    institution: e.institution ? place(e.institution) : null,
    note: e.note,
  };
}

export const attachmentSelect = {
  id: true,
  fileName: true,
  contentType: true,
  sizeBytes: true,
  createdAt: true,
  uploadedBy: { select: { id: true, fullName: true } },
  uploadedByInstitution: { select: { id: true, name: true } },
} as const;

export function toAttachmentView(a: {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: Person;
  uploadedByInstitution: Pick<Institution, 'id' | 'name'>;
}): AttachmentView {
  return {
    id: a.id,
    fileName: a.fileName,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    uploadedBy: person(a.uploadedBy),
    uploadedByInstitution: place(a.uploadedByInstitution),
    createdAt: a.createdAt.toISOString(),
  };
}

export const summaryInclude = {
  patient: true,
  referringInstitution: { select: { id: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  requests: {
    include: { institution: { select: { id: true, name: true } } },
    orderBy: { sentAt: 'asc' },
  },
} as const;
