import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { estimateDriveMinutes, haversineKm } from '@lifeline/domain';
import {
  type CatalogueResponse,
  type CreateInstitutionInput,
  type DepartmentInput,
  type DepartmentView,
  type FacilityDetail,
  type FacilityProfile,
  type FacilitySearchQuery,
  type FacilitySearchResult,
  type UpdateFacilityProfileInput,
  type UpdateInstitutionIdentityInput,
} from '@lifeline/schemas';
import { type Department, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { assertNetworkMember, assertPermission, type AuthContext } from '../auth/auth-context';
import { type RequestMeta } from '../common/request-meta';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanManageInstitution,
  assertFacility,
  loadVisibleInstitution,
} from './facility-access';
import {
  byCatalogueOrder,
  resourcesInclude,
  toCapacityEntry,
  toFacilityProfile,
  toHistoryEntry,
  toResourceView,
  toServiceView,
} from './mappers';

const RECENT_UPDATES = 25;

@Injectable()
export class FacilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async catalogue(auth: AuthContext, networkId: string): Promise<CatalogueResponse> {
    assertNetworkMember(auth, networkId);
    const network = await this.prisma.network.findUniqueOrThrow({
      where: { id: networkId },
      include: {
        services: { orderBy: { sortOrder: 'asc' } },
        resources: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] },
      },
    });
    return {
      services: network.services.map(toServiceView),
      resources: network.resources.map(toResourceView),
      capacityStaleAfterMinutes: network.capacityStaleAfterMinutes,
      earlyWarningScore: network.earlyWarningScore,
    };
  }

  /**
   * Active facilities offering every requested service. A requested resource excludes a facility only
   * when it isn't tracked there or its current, fresh report says unavailable; missing or stale reports
   * are kept and flagged so the clinician can confirm by phone.
   */
  async search(
    auth: AuthContext,
    networkId: string,
    query: FacilitySearchQuery,
  ): Promise<FacilitySearchResult[]> {
    assertNetworkMember(auth, networkId);
    const network = await this.prisma.network.findUniqueOrThrow({ where: { id: networkId } });
    const now = new Date();

    const origin = query.originId
      ? await this.prisma.institution.findFirst({ where: { id: query.originId, networkId } })
      : null;
    if (query.originId && !origin)
      throw new BadRequestException('The starting facility is not in this network.');

    const facilities = await this.prisma.institution.findMany({
      where: {
        networkId,
        type: 'FACILITY',
        status: 'ACTIVE',
        ...(origin ? { id: { not: origin.id } } : {}),
        AND: query.serviceIds.map((serviceId) => ({ services: { some: { serviceId } } })),
      },
      include: {
        services: { include: { service: true } },
        resources: resourcesInclude,
      },
    });

    const results: FacilitySearchResult[] = [];
    for (const facility of facilities) {
      const capacity = [...facility.resources]
        .sort(byCatalogueOrder)
        .map((row) => toCapacityEntry(row, network.capacityStaleAfterMinutes, now));

      const unconfirmed: string[] = [];
      const meetsResources = query.resourceIds.every((resourceId) => {
        const entry = capacity.find((c) => c.resource.id === resourceId);
        if (!entry) return false;
        if (entry.status === null || entry.stale) {
          unconfirmed.push(resourceId);
          return true;
        }
        return entry.status !== 'UNAVAILABLE';
      });
      if (!meetsResources) continue;

      const distanceKm =
        origin?.latitude != null &&
        origin.longitude != null &&
        facility.latitude != null &&
        facility.longitude != null
          ? haversineKm(
              { latitude: origin.latitude, longitude: origin.longitude },
              { latitude: facility.latitude, longitude: facility.longitude },
            )
          : null;

      results.push({
        facility: toFacilityProfile(facility),
        services: facility.services
          .map((fs) => fs.service)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(toServiceView),
        capacity,
        distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
        travelMinutes: distanceKm === null ? null : estimateDriveMinutes(distanceKm),
        unconfirmedResourceIds: unconfirmed,
      });
    }

    return results.sort(
      (a, b) =>
        (a.travelMinutes ?? Number.POSITIVE_INFINITY) -
          (b.travelMinutes ?? Number.POSITIVE_INFINITY) ||
        a.facility.name.localeCompare(b.facility.name),
    );
  }

  async detail(auth: AuthContext, institutionId: string): Promise<FacilityDetail> {
    await loadVisibleInstitution(this.prisma, auth, institutionId);
    const inst = await this.prisma.institution.findUniqueOrThrow({
      where: { id: institutionId },
      include: {
        network: true,
        services: { include: { service: true } },
        resources: resourcesInclude,
        departments: { orderBy: { name: 'asc' } },
        capacityUpdates: {
          orderBy: { recordedAt: 'desc' },
          take: RECENT_UPDATES,
          include: { resource: true, recordedBy: { select: { id: true, fullName: true } } },
        },
      },
    });
    const now = new Date();
    return {
      facility: toFacilityProfile(inst),
      services: inst.services
        .map((fs) => fs.service)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(toServiceView),
      capacity: [...inst.resources]
        .sort(byCatalogueOrder)
        .map((row) => toCapacityEntry(row, inst.network.capacityStaleAfterMinutes, now)),
      departments: inst.departments.map(toDepartmentView),
      recentUpdates: inst.capacityUpdates.map(toHistoryEntry),
      capacityStaleAfterMinutes: inst.network.capacityStaleAfterMinutes,
    };
  }

  async create(
    auth: AuthContext,
    networkId: string,
    input: CreateInstitutionInput,
    meta: RequestMeta,
  ): Promise<FacilityProfile> {
    assertPermission(auth, 'institutions:manage', { networkId });
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const inst = await tx.institution.create({
          data: { ...input, level: input.level ?? null, networkId },
        });
        await this.audit.record(
          {
            action: 'institution.created',
            entityType: 'institution',
            entityId: inst.id,
            actorId: auth.userId,
            networkId,
            institutionId: inst.id,
            metadata: { name: inst.name, code: inst.code, type: inst.type },
            meta,
          },
          tx,
        );
        return inst;
      });
      return toFacilityProfile(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: 'Some fields need attention.',
          errors: [
            {
              path: 'code',
              message: 'Another institution in this network already uses this code.',
            },
          ],
        });
      }
      throw error;
    }
  }

  async updateProfile(
    auth: AuthContext,
    institutionId: string,
    input: UpdateFacilityProfileInput,
    meta: RequestMeta,
  ): Promise<FacilityProfile> {
    const inst = await loadVisibleInstitution(this.prisma, auth, institutionId);
    assertCanManageInstitution(auth, inst);
    const updated = await this.prisma.institution.update({ where: { id: inst.id }, data: input });
    await this.recordChange(
      auth,
      inst,
      'institution.profile_updated',
      { fields: Object.keys(input) },
      meta,
    );
    return toFacilityProfile(updated);
  }

  async updateIdentity(
    auth: AuthContext,
    institutionId: string,
    input: UpdateInstitutionIdentityInput,
    meta: RequestMeta,
  ): Promise<FacilityProfile> {
    const inst = await loadVisibleInstitution(this.prisma, auth, institutionId);
    assertPermission(auth, 'institutions:manage', { networkId: inst.networkId });
    if (input.level != null && inst.type !== 'FACILITY')
      throw new BadRequestException('Levels apply to facilities only.');
    if (input.level === null && inst.type === 'FACILITY')
      throw new BadRequestException('Facilities need a level.');
    const updated = await this.prisma.institution.update({ where: { id: inst.id }, data: input });
    await this.recordChange(auth, inst, 'institution.identity_updated', { ...input }, meta);
    return toFacilityProfile(updated);
  }

  async setServices(
    auth: AuthContext,
    institutionId: string,
    serviceIds: string[],
    meta: RequestMeta,
  ): Promise<void> {
    const inst = await this.loadManagedFacility(auth, institutionId);
    const ids = [...new Set(serviceIds)];
    const valid = await this.prisma.service.count({
      where: { id: { in: ids }, networkId: inst.networkId },
    });
    if (valid !== ids.length)
      throw new BadRequestException('Some services are not in this network’s catalogue.');

    await this.prisma.$transaction([
      this.prisma.facilityService.deleteMany({
        where: { institutionId, serviceId: { notIn: ids } },
      }),
      this.prisma.facilityService.createMany({
        data: ids.map((serviceId) => ({ institutionId, serviceId })),
        skipDuplicates: true,
      }),
    ]);
    await this.recordChange(auth, inst, 'facility.services_updated', { count: ids.length }, meta);
  }

  /** Which resources the facility reports on. Removing one keeps its history in CapacityUpdate. */
  async setResources(
    auth: AuthContext,
    institutionId: string,
    resourceIds: string[],
    meta: RequestMeta,
  ): Promise<void> {
    const inst = await this.loadManagedFacility(auth, institutionId);
    const ids = [...new Set(resourceIds)];
    const valid = await this.prisma.capacityResource.count({
      where: { id: { in: ids }, networkId: inst.networkId },
    });
    if (valid !== ids.length)
      throw new BadRequestException('Some items are not in this network’s catalogue.');

    await this.prisma.$transaction([
      this.prisma.facilityResource.deleteMany({
        where: { institutionId, resourceId: { notIn: ids } },
      }),
      this.prisma.facilityResource.createMany({
        data: ids.map((resourceId) => ({ institutionId, resourceId })),
        skipDuplicates: true,
      }),
    ]);
    await this.recordChange(auth, inst, 'facility.resources_updated', { count: ids.length }, meta);
  }

  async addDepartment(
    auth: AuthContext,
    institutionId: string,
    input: DepartmentInput,
    meta: RequestMeta,
  ): Promise<DepartmentView> {
    const inst = await this.loadManagedFacility(auth, institutionId);
    const dept = await this.prisma.department.create({
      data: {
        institutionId,
        name: input.name,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
      },
    });
    await this.recordChange(
      auth,
      inst,
      'department.created',
      { departmentId: dept.id, name: dept.name },
      meta,
    );
    return toDepartmentView(dept);
  }

  async updateDepartment(
    auth: AuthContext,
    departmentId: string,
    input: DepartmentInput,
    meta: RequestMeta,
  ): Promise<DepartmentView> {
    const existing = await this.loadDepartment(departmentId);
    const inst = await this.loadManagedFacility(auth, existing.institutionId);
    const dept = await this.prisma.department.update({
      where: { id: departmentId },
      data: { name: input.name, phone: input.phone ?? null, notes: input.notes ?? null },
    });
    await this.recordChange(
      auth,
      inst,
      'department.updated',
      { departmentId, name: dept.name },
      meta,
    );
    return toDepartmentView(dept);
  }

  async removeDepartment(
    auth: AuthContext,
    departmentId: string,
    meta: RequestMeta,
  ): Promise<void> {
    const existing = await this.loadDepartment(departmentId);
    const inst = await this.loadManagedFacility(auth, existing.institutionId);
    await this.prisma.department.delete({ where: { id: departmentId } });
    await this.recordChange(
      auth,
      inst,
      'department.removed',
      { departmentId, name: existing.name },
      meta,
    );
  }

  private async loadManagedFacility(auth: AuthContext, institutionId: string) {
    const inst = await loadVisibleInstitution(this.prisma, auth, institutionId);
    assertFacility(inst);
    assertCanManageInstitution(auth, inst);
    return inst;
  }

  private async loadDepartment(departmentId: string): Promise<Department> {
    const dept = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) throw new NotFoundException('Department not found.');
    return dept;
  }

  private recordChange(
    auth: AuthContext,
    inst: { id: string; networkId: string },
    action: string,
    metadata: Record<string, unknown>,
    meta: RequestMeta,
  ) {
    return this.audit.record({
      action,
      entityType: 'institution',
      entityId: inst.id,
      actorId: auth.userId,
      networkId: inst.networkId,
      institutionId: inst.id,
      metadata,
      meta,
    });
  }
}

function toDepartmentView(dept: Department): DepartmentView {
  return { id: dept.id, name: dept.name, phone: dept.phone, notes: dept.notes };
}
