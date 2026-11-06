import {
  ASSIGNMENT_DECLINE_REASONS,
  type AssignmentDeclineReason,
  type AssignmentStatus,
  CAPABILITY_LEVELS,
  type CapabilityLevel,
  CREW_QUALIFICATIONS,
  type CrewQualification,
  EQUIPMENT_CODES,
  EXTERNAL_TRANSPORT_SERVICES,
  type ExternalTransportService,
  type Sex,
  TRANSPORT_PAYERS,
  type TransportPayer,
  type TransferStatus,
  type Urgency,
  VEHICLE_STATUSES,
  type VehicleStatus,
} from '@lifeline/domain';
import { z } from 'zod';
import { type TrackingView } from './live';
import { kenyanPhoneNumberSchema, latitudeSchema, longitudeSchema } from './facilities';

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no more than ${max} characters.`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

const optionalPhone = kenyanPhoneNumberSchema
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));

const equipmentList = z
  .array(z.enum(EQUIPMENT_CODES))
  .max(EQUIPMENT_CODES.length)
  .transform((codes) => [...new Set(codes)]);

const id = z.string().min(1);

const crewIds = z
  .array(id)
  .min(1, 'Choose at least one crew member.')
  .max(6, 'Choose no more than 6 crew members.')
  .refine((ids) => new Set(ids).size === ids.length, 'Each crew member can be chosen once.');

// ---- Transfers ----

const transferFields = {
  requiredCapability: z.enum(CAPABILITY_LEVELS),
  requiredEquipment: equipmentList.default([]),
  /** When the patient will be ready for collection. Empty means now. */
  readyAt: z.string().datetime({ offset: true }).nullable().optional(),
  /** What the crew needs to know, e.g. "On 4 L oxygen, cervical collar in place". */
  notes: text(1000),
};

export const transferRequestSchema = z.object(transferFields);
export type TransferRequestInput = z.infer<typeof transferRequestSchema>;

export const updateTransferSchema = z.object({
  requiredCapability: transferFields.requiredCapability.optional(),
  requiredEquipment: equipmentList.optional(),
  readyAt: transferFields.readyAt,
  notes: transferFields.notes,
});
export type UpdateTransferInput = z.infer<typeof updateTransferSchema>;

/** A receiving decision-maker confirms the essential clinical handover items. */
export const handoverSchema = z.object({
  patientIdentityConfirmed: z.literal(true),
  clinicalSummaryReceived: z.literal(true),
  latestObservationsReceived: z.literal(true),
  treatmentAndAllergiesReviewed: z.literal(true),
  documentsAndResultsAddressed: z.literal(true),
  notes: text(1000),
});
export type HandoverInput = z.infer<typeof handoverSchema>;

/** Costs are recorded in Kenyan shillings; this records them but does not process payment. */
export const transportCostSchema = z
  .object({
    amount: z
      .string()
      .regex(/^\d{1,9}(\.\d{1,2})?$/, 'Enter an amount with no more than two decimal places.')
      .transform(Number),
    payer: z.enum(TRANSPORT_PAYERS),
    payerName: text(120),
    notes: text(500),
  })
  .refine((value) => value.payer !== 'OTHER' || !!value.payerName, {
    path: ['payerName'],
    message: 'Name the payer.',
  });
export type TransportCostInput = z.infer<typeof transportCostSchema>;

export const offerVehicleSchema = z.object({ vehicleId: id, note: text(500) });
export type OfferVehicleInput = z.infer<typeof offerVehicleSchema>;

export const externalTransportSchema = z
  .object({
    service: z.enum(EXTERNAL_TRANSPORT_SERVICES),
    providerName: text(120),
    vehicleRegistration: text(20),
    contactPhone: optionalPhone,
    note: text(500),
  })
  .refine((v) => v.service !== 'OTHER' || !!v.providerName, {
    path: ['providerName'],
    message: 'Say who is providing the transport.',
  });
export type ExternalTransportInput = z.infer<typeof externalTransportSchema>;

export const confirmAssignmentSchema = z.object({
  /** The offered vehicle, or another of the provider's suitable vehicles. */
  vehicleId: id,
  crewMemberIds: crewIds,
  /** The provider's own estimate of minutes to pickup. */
  etaMinutes: z.number().int().min(1).max(600).nullable().optional(),
  note: text(500),
});
export type ConfirmAssignmentInput = z.infer<typeof confirmAssignmentSchema>;

export const declineAssignmentSchema = z
  .object({ reason: z.enum(ASSIGNMENT_DECLINE_REASONS), note: text(500) })
  .refine((v) => v.reason !== 'OTHER' || !!v.note, {
    path: ['note'],
    message: 'Explain why the transfer is declined.',
  });
export type DeclineAssignmentInput = z.infer<typeof declineAssignmentSchema>;

export const reassignSchema = z.object({
  vehicleId: id,
  crewMemberIds: crewIds,
  reason: z.string().trim().min(3, 'Give a short reason.').max(500),
});
export type ReassignInput = z.infer<typeof reassignSchema>;

export const listTransfersQuerySchema = z.object({
  networkId: id,
  /** facility: to or from my facilities; provider: offered to my providers; network: everything. */
  box: z.enum(['facility', 'provider', 'network']),
  open: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type ListTransfersQuery = z.infer<typeof listTransfersQuerySchema>;

// ---- Fleet ----

/** Kenyan plates vary (KCA 123A, GK A123B, 41CG 012A), so only the character set is checked. */
const registration = z
  .string()
  .trim()
  .toUpperCase()
  .transform((v) => v.replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .regex(/^[A-Z0-9 ]{3,12}$/, 'Use letters, numbers and spaces only, as on the number plate.'),
  );

const vehicleFields = {
  registration,
  callSign: text(20),
  capability: z.enum(CAPABILITY_LEVELS),
  equipment: equipmentList.default([]),
  /** Station or garage; defaults to the provider's address for distance estimates. */
  baseName: text(80),
  baseLatitude: latitudeSchema.nullable().optional(),
  baseLongitude: longitudeSchema.nullable().optional(),
};

const bothOrNeither = (v: { baseLatitude?: number | null; baseLongitude?: number | null }) =>
  (v.baseLatitude == null) === (v.baseLongitude == null);
const coordinatesMessage = {
  path: ['baseLongitude'],
  message: 'Give both latitude and longitude, or neither.',
};

export const vehicleInputSchema = z.object(vehicleFields).refine(bothOrNeither, coordinatesMessage);
export type VehicleInput = z.infer<typeof vehicleInputSchema>;

export const updateVehicleSchema = z
  .object({
    registration: vehicleFields.registration.optional(),
    callSign: vehicleFields.callSign,
    capability: vehicleFields.capability.optional(),
    equipment: equipmentList.optional(),
    baseName: vehicleFields.baseName,
    baseLatitude: vehicleFields.baseLatitude,
    baseLongitude: vehicleFields.baseLongitude,
    /** Inactive vehicles are retired from the fleet and never suggested. */
    recordStatus: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .refine(bothOrNeither, coordinatesMessage);
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

export const vehicleStatusSchema = z.object({
  status: z.enum(VEHICLE_STATUSES),
  note: text(200),
});
export type VehicleStatusInput = z.infer<typeof vehicleStatusSchema>;

export const crewMemberInputSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name.').max(120),
  phone: optionalPhone,
  qualification: z.enum(CREW_QUALIFICATIONS),
  /** Their Lifeline account, so the trip appears in their crew app. */
  userId: id.nullable().optional(),
});
export type CrewMemberInput = z.infer<typeof crewMemberInputSchema>;

export const updateCrewMemberSchema = z.object({
  fullName: crewMemberInputSchema.shape.fullName.optional(),
  phone: optionalPhone,
  qualification: z.enum(CREW_QUALIFICATIONS).optional(),
  userId: id.nullable().optional(),
  recordStatus: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export type UpdateCrewMemberInput = z.infer<typeof updateCrewMemberSchema>;

// ---- Responses ----

type Ref = { id: string; name: string };
type PersonRef = { id: string; fullName: string };

export interface VehicleView {
  id: string;
  provider: Ref;
  registration: string;
  callSign: string | null;
  capability: CapabilityLevel;
  equipment: string[];
  status: VehicleStatus;
  statusNote: string | null;
  statusUpdatedAt: string | null;
  statusUpdatedBy: PersonRef | null;
  /** Availability not confirmed within the network's limit. */
  stale: boolean;
  base: { name: string | null; latitude: number; longitude: number } | null;
  lastPosition: { latitude: number; longitude: number; at: string } | null;
  /** The transfer it is confirmed for, if any. */
  onTransfer: { id: string; reference: string } | null;
  recordStatus: 'ACTIVE' | 'INACTIVE';
}

export interface CrewMemberView {
  id: string;
  provider: Ref;
  fullName: string;
  phone: string | null;
  qualification: CrewQualification;
  account: { id: string; email: string } | null;
  onTransfer: boolean;
  recordStatus: 'ACTIVE' | 'INACTIVE';
}

export interface CrewListResponse {
  crew: CrewMemberView[];
  /** Crew accounts at the provider not yet linked to a crew member. */
  unlinkedAccounts: { id: string; fullName: string; email: string }[];
}

export interface VehicleRef {
  id: string;
  registration: string;
  callSign: string | null;
  capability: CapabilityLevel;
  equipment: string[];
}

export interface VehicleSuggestionView {
  vehicle: VehicleRef;
  provider: Ref & { phone: string | null };
  etaMinutes: number | null;
  distanceKm: number | null;
  from: 'LAST_POSITION' | 'BASE' | null;
  reasons: string[];
  cautions: string[];
}

export interface SuggestionsResponse {
  suggestions: VehicleSuggestionView[];
  excluded: { vehicle: VehicleRef; provider: Ref; reasons: string[] }[];
  staleAfterMinutes: number;
}

export interface AssignmentView {
  id: string;
  kind: 'PROVIDER' | 'EXTERNAL';
  status: AssignmentStatus;
  provider: (Ref & { phone: string | null }) | null;
  vehicle: VehicleRef | null;
  crew: { id: string; fullName: string; qualification: CrewQualification; phone: string | null }[];
  proposedBy: PersonRef;
  proposedAt: string;
  respondedBy: PersonRef | null;
  respondedAt: string | null;
  declineReason: AssignmentDeclineReason | null;
  note: string | null;
  responseNote: string | null;
  etaMinutes: number | null;
  endedAt: string | null;
  endReason: string | null;
  external: {
    service: ExternalTransportService;
    providerName: string | null;
    vehicleRegistration: string | null;
    contactPhone: string | null;
  } | null;
}

export interface TransferEventView {
  id: string;
  type: string;
  occurredAt: string;
  actor: PersonRef | null;
  institution: Ref | null;
  note: string | null;
  /** When the server received it; later than occurredAt for updates queued offline. */
  receivedAt: string;
  source: 'WEB' | 'CREW_APP';
}

interface PlaceView extends Ref {
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface TransferDetail {
  id: string;
  networkId: string;
  status: TransferStatus;
  referral: { id: string; reference: string; urgency: Urgency | null };
  /** Withheld from providers until they confirm, and from roles that don't need it. */
  patient: { displayName: string; sex: Sex; ageYears: number | null } | null;
  pickup: PlaceView;
  destination: PlaceView & { department: { name: string; phone: string | null } | null };
  requiredCapability: CapabilityLevel;
  requiredEquipment: string[];
  readyAt: string | null;
  notes: string | null;
  requestedBy: PersonRef;
  requestedAt: string;
  assignedAt: string | null;
  dispatchedAt: string | null;
  atPickupAt: string | null;
  collectedAt: string | null;
  arrivedAt: string | null;
  handedOverAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Live position and arrival estimate while the ambulance is on its way; null otherwise. */
  tracking: TrackingView | null;
  handover: HandoverView | null;
  cost: TransferCostView | null;
  /** Rough pickup-to-destination drive time. */
  tripMinutes: number | null;
  current: AssignmentView | null;
  /** Every assignment the viewer may see, oldest first. Providers see only their own. */
  assignments: AssignmentView[];
  events: TransferEventView[];
  viewer: {
    /** Can offer vehicles, record external transport, withdraw offers and cancel. */
    canArrange: boolean;
    /** Assignments the viewer can confirm, decline, reassign, release or dispatch. */
    dispatchableAssignmentIds: string[];
    /** Can open the referral itself. */
    canViewReferral: boolean;
    canSignHandover: boolean;
    canRecordCost: boolean;
    canComplete: boolean;
  };
}

export interface HandoverView {
  patientIdentityConfirmed: boolean;
  clinicalSummaryReceived: boolean;
  latestObservationsReceived: boolean;
  treatmentAndAllergiesReviewed: boolean;
  documentsAndResultsAddressed: boolean;
  notes: string | null;
  signedAt: string;
  signedBy: PersonRef;
}

export interface TransferCostView {
  amount: number;
  currency: 'KES';
  payer: TransportPayer;
  payerName: string | null;
  notes: string | null;
  recordedAt: string;
  recordedBy: PersonRef;
}

export interface TransferSummary {
  id: string;
  status: TransferStatus;
  referral: { id: string; reference: string; urgency: Urgency | null };
  patient: { displayName: string } | null;
  pickup: Ref;
  destination: Ref;
  requiredCapability: CapabilityLevel;
  current: {
    status: AssignmentStatus;
    kind: 'PROVIDER' | 'EXTERNAL';
    providerName: string | null;
    vehicleRegistration: string | null;
  } | null;
  requestedAt: string;
  updatedAt: string;
  handoverRecorded: boolean;
  costRecorded: boolean;
  /** Last position and arrival estimate, for transfers being tracked. */
  tracking: Pick<TrackingView, 'position' | 'eta'> | null;
  /** Why someone should look at it, e.g. "No vehicle offered yet". */
  attention: string | null;
  nextAction: string | null;
}
