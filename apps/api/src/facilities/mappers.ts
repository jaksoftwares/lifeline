import { isStale } from '@lifeline/domain';
import {
  type CapacityEntry,
  type CapacityHistoryEntry,
  type FacilityProfile,
  type ResourceView,
  type ServiceView,
} from '@lifeline/schemas';
import {
  type CapacityResource,
  type CapacityUpdate,
  type FacilityResource,
  type Institution,
  type Service,
  type User,
} from '@prisma/client';

export function toFacilityProfile(inst: Institution): FacilityProfile {
  return {
    id: inst.id,
    networkId: inst.networkId,
    type: inst.type,
    name: inst.name,
    code: inst.code,
    level: inst.level,
    county: inst.county,
    status: inst.status,
    ownership: inst.ownership,
    address: inst.address,
    phone: inst.phone,
    latitude: inst.latitude,
    longitude: inst.longitude,
  };
}

export function toServiceView(service: Service): ServiceView {
  return { id: service.id, code: service.code, name: service.name, category: service.category };
}

export function toResourceView(resource: CapacityResource): ResourceView {
  return { id: resource.id, code: resource.code, name: resource.name, kind: resource.kind };
}

type FacilityResourceWithRelations = FacilityResource & {
  resource: CapacityResource;
  updatedBy: Pick<User, 'id' | 'fullName'> | null;
};

export function toCapacityEntry(
  row: FacilityResourceWithRelations,
  staleAfterMinutes: number,
  now: Date,
): CapacityEntry {
  return {
    resource: toResourceView(row.resource),
    status: row.status,
    available: row.available,
    total: row.total,
    note: row.note,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    updatedBy: row.updatedBy ? { id: row.updatedBy.id, fullName: row.updatedBy.fullName } : null,
    stale: row.updatedAt ? isStale(row.updatedAt, staleAfterMinutes, now) : false,
  };
}

/** Catalogue order: beds, then equipment, then specialists, each in catalogue sequence. */
export function byCatalogueOrder(
  a: { resource: CapacityResource },
  b: { resource: CapacityResource },
) {
  const kindOrder = { BED: 0, EQUIPMENT: 1, SPECIALIST: 2 } as const;
  return (
    kindOrder[a.resource.kind] - kindOrder[b.resource.kind] ||
    a.resource.sortOrder - b.resource.sortOrder
  );
}

export function toHistoryEntry(
  row: CapacityUpdate & {
    resource: CapacityResource;
    recordedBy: Pick<User, 'id' | 'fullName'> | null;
  },
): CapacityHistoryEntry {
  return {
    id: row.id,
    resource: toResourceView(row.resource),
    status: row.status,
    available: row.available,
    total: row.total,
    note: row.note,
    recordedAt: row.recordedAt.toISOString(),
    recordedBy: row.recordedBy
      ? { id: row.recordedBy.id, fullName: row.recordedBy.fullName }
      : null,
  };
}

/** Prisma include for a facility's tracked resources with who last updated them. */
export const resourcesInclude = {
  include: { resource: true, updatedBy: { select: { id: true, fullName: true } } },
} as const;
