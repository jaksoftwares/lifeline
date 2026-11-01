import {
  type CapabilityLevel,
  CREW_STATUSES,
  type CrewQualification,
  type CrewStatus,
  type Sex,
  type TransferStatus,
  type Urgency,
} from '@lifeline/domain';
import { z } from 'zod';
import { latitudeSchema, longitudeSchema } from './facilities';

export const MAX_SYNC_STATUS_UPDATES = 100;
export const MAX_SYNC_LOCATIONS = 500;

const deviceTime = z.string().datetime({ offset: true });

/** One button press in the crew app, queued until it reaches the server. */
export const crewStatusUpdateSchema = z
  .object({
    /** Generated on the device; makes retries safe. */
    clientId: z.string().uuid(),
    assignmentId: z.string().min(1),
    status: z.enum(CREW_STATUSES),
    /** Device time of the press, not when it was sent. */
    occurredAt: deviceTime,
    note: z.string().trim().max(500).optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
  })
  .refine((u) => u.status !== 'INTERRUPTED' || !!u.note, {
    path: ['note'],
    message: 'Say what happened.',
  });
export type CrewStatusUpdate = z.infer<typeof crewStatusUpdateSchema>;

export const locationPingSchema = z.object({
  assignmentId: z.string().min(1),
  recordedAt: deviceTime,
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  /** Metres, as reported by the device. */
  accuracy: z.number().min(0).max(100_000).nullable().optional(),
  speed: z.number().min(0).max(100).nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
});
export type LocationPing = z.infer<typeof locationPingSchema>;

/** Everything the app has queued, sent in one request so a brief signal is enough. */
export const crewSyncSchema = z.object({
  statusUpdates: z.array(crewStatusUpdateSchema).max(MAX_SYNC_STATUS_UPDATES).default([]),
  locations: z.array(locationPingSchema).max(MAX_SYNC_LOCATIONS).default([]),
});
export type CrewSyncInput = z.infer<typeof crewSyncSchema>;

export type CrewSyncOutcome =
  /** Recorded now. */
  | 'APPLIED'
  /** The same press was received before (a retry). */
  | 'DUPLICATE'
  /** The transfer had already reached this step, e.g. the dispatcher recorded it. */
  | 'ALREADY_RECORDED'
  | 'REJECTED';

export type CrewSyncRejection =
  /** The crew member was taken off this trip (vehicle or crew changed). */
  | 'NOT_ON_TRIP'
  /** The trip was released, withdrawn or cancelled. */
  | 'TRIP_ENDED'
  | 'INVALID_TRANSITION';

export interface CrewSyncResult {
  clientId: string;
  outcome: CrewSyncOutcome;
  reason?: CrewSyncRejection;
  /** Shown to the crew when an update is rejected. */
  message?: string;
  transferStatus?: TransferStatus;
}

export interface CrewSyncResponse {
  statusResults: CrewSyncResult[];
  locationsAccepted: number;
  /** The crew member's active trips after applying the updates. */
  trips: CrewTrip[];
  serverTime: string;
}

interface CrewPlace {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** A trip as the crew sees it: who to collect, from where, to where, and what they need. */
export interface CrewTrip {
  assignmentId: string;
  transferId: string;
  reference: string;
  urgency: Urgency | null;
  status: TransferStatus;
  nextStatus: CrewStatus | null;
  patient: { displayName: string; sex: Sex; ageYears: number | null };
  pickup: CrewPlace;
  destination: CrewPlace & { department: { name: string; phone: string | null } | null };
  requiredCapability: CapabilityLevel;
  requiredEquipment: string[];
  notes: string | null;
  readyAt: string | null;
  vehicle: { registration: string; callSign: string | null } | null;
  crew: { fullName: string; qualification: CrewQualification }[];
  dispatcherPhone: string | null;
  confirmedAt: string | null;
  updatedAt: string;
}
