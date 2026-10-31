import {
  AVAILABILITY_STATUSES,
  type AvailabilityStatus,
  type EarlyWarningScore,
  FACILITY_LEVELS,
  INSTITUTION_TYPES,
  KENYAN_COUNTIES,
  OWNERSHIP_TYPES,
  type Ownership,
  type ResourceKind,
} from '@lifeline/domain';
import { z } from 'zod';
import { type InstitutionSummary } from './institutions';

/** Any Kenyan number in international format: mobiles and landlines both have nine digits after +254. */
export const kenyanPhoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+254\d{9}$/, 'Enter the number in the format +254XXXXXXXXX.');

// Rough bounding box of Kenya; catches swapped latitude/longitude and typos.
export const latitudeSchema = z
  .number()
  .min(-4.9, 'Location must be within Kenya.')
  .max(5.1, 'Location must be within Kenya.');
export const longitudeSchema = z
  .number()
  .min(33.9, 'Location must be within Kenya.')
  .max(42, 'Location must be within Kenya.');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

const profileFields = {
  county: z.enum(KENYAN_COUNTIES).nullable().optional(),
  ownership: z.enum(OWNERSHIP_TYPES).nullable().optional(),
  address: optionalText(200),
  phone: kenyanPhoneNumberSchema
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  latitude: latitudeSchema.nullable().optional(),
  longitude: longitudeSchema.nullable().optional(),
};

const levelSchema = z
  .number()
  .int()
  .min(FACILITY_LEVELS[0], 'Levels run from 1 to 6.')
  .max(FACILITY_LEVELS[FACILITY_LEVELS.length - 1]!, 'Levels run from 1 to 6.');

export const createInstitutionSchema = z
  .object({
    type: z.enum(INSTITUTION_TYPES),
    name: z.string().trim().min(3, 'Enter the institution’s name.').max(120),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{2,20}$/, 'Use 2–20 letters, digits or hyphens.'),
    level: levelSchema.nullable().optional(),
    ...profileFields,
  })
  .superRefine((value, ctx) => {
    if (value.type === 'FACILITY' && value.level == null) {
      ctx.addIssue({ code: 'custom', path: ['level'], message: 'Select the facility level.' });
    }
    if (value.type === 'AMBULANCE_PROVIDER' && value.level != null) {
      ctx.addIssue({
        code: 'custom',
        path: ['level'],
        message: 'Levels apply to facilities only.',
      });
    }
    if ((value.latitude == null) !== (value.longitude == null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['longitude'],
        message: 'Enter both latitude and longitude, or neither.',
      });
    }
  });
export type CreateInstitutionInput = z.infer<typeof createInstitutionSchema>;

/** Contact and location details; facility administrators may edit these for their own facility. */
export const updateFacilityProfileSchema = z
  .object(profileFields)
  .refine((v) => (v.latitude == null) === (v.longitude == null), {
    path: ['longitude'],
    message: 'Enter both latitude and longitude, or neither.',
  });
export type UpdateFacilityProfileInput = z.infer<typeof updateFacilityProfileSchema>;

/** Identity fields; network administrators only. */
export const updateInstitutionIdentitySchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  level: levelSchema.nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export type UpdateInstitutionIdentityInput = z.infer<typeof updateInstitutionIdentitySchema>;

export const setServicesSchema = z.object({ serviceIds: z.array(z.string().min(1)).max(100) });
export const setResourcesSchema = z.object({ resourceIds: z.array(z.string().min(1)).max(100) });

export const departmentInputSchema = z.object({
  name: z.string().trim().min(2, 'Enter the department name.').max(80),
  phone: kenyanPhoneNumberSchema
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  notes: optionalText(280),
});
export type DepartmentInput = z.infer<typeof departmentInputSchema>;

export const capacityReportSchema = z.object({
  resourceId: z.string().min(1),
  status: z.enum(AVAILABILITY_STATUSES),
  available: z.number().int().min(0).max(9999).nullable().optional(),
  total: z.number().int().min(1).max(9999).nullable().optional(),
  note: optionalText(280),
});

export const capacityUpdateSchema = z.object({
  reports: z.array(capacityReportSchema).min(1, 'Report at least one item.').max(50),
});
export type CapacityUpdateInput = z.infer<typeof capacityUpdateSchema>;

const idList = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').filter(Boolean) : []));

export const facilitySearchQuerySchema = z.object({
  /** Facilities must offer every listed service. */
  serviceIds: idList,
  /** Facilities must track each resource and not currently report it unavailable. */
  resourceIds: idList,
  /** Travel time is estimated from this institution. */
  originId: z.string().min(1).optional(),
});
export type FacilitySearchQuery = z.infer<typeof facilitySearchQuerySchema>;

// ---- Responses ----

export interface ServiceView {
  id: string;
  code: string;
  name: string;
  category: string;
}

export interface ResourceView {
  id: string;
  code: string;
  name: string;
  kind: ResourceKind;
}

export interface CatalogueResponse {
  services: ServiceView[];
  resources: ResourceView[];
  capacityStaleAfterMinutes: number;
  /** The early-warning score this network uses on referrals, or NONE. */
  earlyWarningScore: EarlyWarningScore;
}

export interface FacilityProfile extends InstitutionSummary {
  ownership: Ownership | null;
  address: string | null;
  phone: string | null;
}

export interface CapacityEntry {
  resource: ResourceView;
  /** Null until first reported. */
  status: AvailabilityStatus | null;
  available: number | null;
  total: number | null;
  note: string | null;
  updatedAt: string | null;
  updatedBy: { id: string; fullName: string } | null;
  stale: boolean;
}

export interface FacilitySearchResult {
  facility: FacilityProfile;
  services: ServiceView[];
  capacity: CapacityEntry[];
  /** Straight-line distance from the origin; null without coordinates for both. */
  distanceKm: number | null;
  /** Estimated drive time; always an estimate, never a promise. */
  travelMinutes: number | null;
  /** Requested resources whose latest report is missing or stale. */
  unconfirmedResourceIds: string[];
}

export interface DepartmentView {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
}

export interface CapacityHistoryEntry {
  id: string;
  resource: ResourceView;
  status: AvailabilityStatus;
  available: number | null;
  total: number | null;
  note: string | null;
  recordedAt: string;
  recordedBy: { id: string; fullName: string } | null;
}

export interface FacilityDetail {
  facility: FacilityProfile;
  services: ServiceView[];
  capacity: CapacityEntry[];
  departments: DepartmentView[];
  recentUpdates: CapacityHistoryEntry[];
  capacityStaleAfterMinutes: number;
}
