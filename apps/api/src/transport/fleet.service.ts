import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hasPermission, permittedInstitutionIds } from '@lifeline/domain';
import {
  type CrewListResponse,
  type CrewMemberInput,
  type UpdateCrewMemberInput,
  type UpdateVehicleInput,
  type VehicleInput,
  type VehicleStatusInput,
  type VehicleView,
} from '@lifeline/schemas';
import { type Institution, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  assertNetworkMember,
  assertPermission,
  type AuthContext,
  NOT_PERMITTED,
} from '../auth/auth-context';
import { type RequestMeta } from '../common/request-meta';
import { PrismaService } from '../prisma/prisma.service';
import { person, toCrewMemberView, toVehicleView } from './mappers';
import { isUniqueViolation } from './transfer-records';

const DUPLICATE_REGISTRATION =
  'A vehicle with this registration is already registered in this network.';

@Injectable()
export class FleetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Providers' own staff see their fleet; network operations see every provider's. */
  async listVehicles(
    auth: AuthContext,
    networkId: string,
    providerId?: string,
  ): Promise<VehicleView[]> {
    assertNetworkMember(auth, networkId);
    const scope = this.fleetScope(auth, networkId);
    if (scope !== 'ALL' && scope.length === 0) throw new ForbiddenException(NOT_PERMITTED);
    if (providerId && scope !== 'ALL' && !scope.includes(providerId))
      throw new ForbiddenException(NOT_PERMITTED);

    const ids = providerId ? [providerId] : scope;
    const [network, vehicles] = await Promise.all([
      this.prisma.network.findUniqueOrThrow({ where: { id: networkId } }),
      this.prisma.vehicle.findMany({
        where: { networkId, ...(ids === 'ALL' ? {} : { institutionId: { in: ids } }) },
        include: {
          institution: true,
          statusUpdatedBy: person,
          assignments: {
            where: { status: 'CONFIRMED' },
            select: {
              transfer: { select: { id: true, referral: { select: { reference: true } } } },
            },
          },
        },
        orderBy: [{ institution: { name: 'asc' } }, { registration: 'asc' }],
      }),
    ]);
    return vehicles.map((v) => {
      const trip = v.assignments[0]?.transfer;
      return toVehicleView(v, {
        staleAfterMinutes: network.vehicleStatusStaleAfterMinutes,
        onTransfer: trip ? { id: trip.id, reference: trip.referral.reference } : null,
      });
    });
  }

  async createVehicle(
    auth: AuthContext,
    providerId: string,
    input: VehicleInput,
    meta: RequestMeta,
  ): Promise<{ id: string }> {
    const provider = await this.loadProvider(auth, providerId);
    assertPermission(auth, 'fleet:manage', {
      networkId: provider.networkId,
      institutionId: provider.id,
    });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const vehicle = await tx.vehicle.create({
          data: {
            networkId: provider.networkId,
            institutionId: provider.id,
            registration: input.registration,
            callSign: input.callSign ?? null,
            capability: input.capability,
            equipment: input.equipment,
            baseName: input.baseName ?? null,
            baseLatitude: input.baseLatitude ?? null,
            baseLongitude: input.baseLongitude ?? null,
          },
        });
        await this.audit.record(
          {
            action: 'vehicle.created',
            entityType: 'vehicle',
            entityId: vehicle.id,
            actorId: auth.userId,
            networkId: provider.networkId,
            institutionId: provider.id,
            metadata: { registration: vehicle.registration, capability: vehicle.capability },
            meta,
          },
          tx,
        );
        return { id: vehicle.id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(DUPLICATE_REGISTRATION);
      throw error;
    }
  }

  async updateVehicle(
    auth: AuthContext,
    vehicleId: string,
    input: UpdateVehicleInput,
    meta: RequestMeta,
  ): Promise<void> {
    const vehicle = await this.loadVehicle(auth, vehicleId);
    assertPermission(auth, 'fleet:manage', {
      networkId: vehicle.networkId,
      institutionId: vehicle.institutionId,
    });
    if (input.recordStatus === 'INACTIVE' && (await this.onTrip(vehicle.id))) {
      throw new ConflictException(
        'This vehicle is on a transfer. Retire it once the trip has ended.',
      );
    }
    const data: Prisma.VehicleUpdateInput = {};
    for (const key of [
      'registration',
      'callSign',
      'capability',
      'equipment',
      'baseName',
      'baseLatitude',
      'baseLongitude',
      'recordStatus',
    ] as const) {
      if (input[key] !== undefined) (data as Record<string, unknown>)[key] = input[key];
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.vehicle.update({ where: { id: vehicleId }, data });
        await this.audit.record(
          {
            action: 'vehicle.updated',
            entityType: 'vehicle',
            entityId: vehicleId,
            actorId: auth.userId,
            networkId: vehicle.networkId,
            institutionId: vehicle.institutionId,
            metadata: {
              registration: input.registration ?? vehicle.registration,
              fields: Object.keys(data),
            },
            meta,
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(DUPLICATE_REGISTRATION);
      throw error;
    }
  }

  /**
   * Dispatchers set availability at the start of each shift and whenever it changes. Re-saving the same
   * status confirms it is still true, which keeps the vehicle out of the stale list.
   */
  async setVehicleStatus(
    auth: AuthContext,
    vehicleId: string,
    input: VehicleStatusInput,
    meta: RequestMeta,
  ): Promise<void> {
    const vehicle = await this.loadVehicle(auth, vehicleId);
    const target = { networkId: vehicle.networkId, institutionId: vehicle.institutionId };
    if (
      !hasPermission(auth.grants, 'dispatch:assign', target) &&
      !hasPermission(auth.grants, 'fleet:manage', target)
    ) {
      throw new ForbiddenException(NOT_PERMITTED);
    }
    if (vehicle.recordStatus === 'INACTIVE')
      throw new ConflictException('This vehicle has been retired from the fleet.');

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: {
          status: input.status,
          statusNote: input.note ?? null,
          statusUpdatedAt: new Date(),
          statusUpdatedById: auth.userId,
        },
      });
      await this.audit.record(
        {
          action: 'vehicle.status_updated',
          entityType: 'vehicle',
          entityId: vehicleId,
          actorId: auth.userId,
          networkId: vehicle.networkId,
          institutionId: vehicle.institutionId,
          metadata: { registration: vehicle.registration, from: vehicle.status, to: input.status },
          meta,
        },
        tx,
      );
    });
  }

  async listCrew(auth: AuthContext, providerId: string): Promise<CrewListResponse> {
    const provider = await this.loadProvider(auth, providerId);
    const scope = this.fleetScope(auth, provider.networkId);
    if (scope !== 'ALL' && !scope.includes(provider.id))
      throw new ForbiddenException(NOT_PERMITTED);

    const [crew, accounts] = await Promise.all([
      this.prisma.crewMember.findMany({
        where: { institutionId: provider.id },
        include: {
          institution: { select: { id: true, name: true } },
          user: { select: { id: true, email: true } },
          assignments: {
            where: { assignment: { status: 'CONFIRMED' } },
            select: { assignmentId: true },
          },
        },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          memberships: { some: { institutionId: provider.id, role: 'AMBULANCE_CREW' } },
          crewProfiles: { none: { institutionId: provider.id } },
        },
        select: { id: true, fullName: true, email: true },
        orderBy: { fullName: 'asc' },
      }),
    ]);
    return {
      crew: crew.map((c) => toCrewMemberView(c, c.assignments.length > 0)),
      unlinkedAccounts: accounts,
    };
  }

  async createCrewMember(
    auth: AuthContext,
    providerId: string,
    input: CrewMemberInput,
    meta: RequestMeta,
  ): Promise<{ id: string }> {
    const provider = await this.loadProvider(auth, providerId);
    assertPermission(auth, 'fleet:manage', {
      networkId: provider.networkId,
      institutionId: provider.id,
    });
    if (input.userId) await this.assertCrewAccount(input.userId, provider.id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const member = await tx.crewMember.create({
          data: {
            institutionId: provider.id,
            fullName: input.fullName,
            phone: input.phone ?? null,
            qualification: input.qualification,
            userId: input.userId ?? null,
          },
        });
        await this.audit.record(
          {
            action: 'crew.created',
            entityType: 'crew_member',
            entityId: member.id,
            actorId: auth.userId,
            networkId: provider.networkId,
            institutionId: provider.id,
            metadata: { qualification: member.qualification, linked: !!member.userId },
            meta,
          },
          tx,
        );
        return { id: member.id };
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('That account is already linked to another crew member.');
      throw error;
    }
  }

  async updateCrewMember(
    auth: AuthContext,
    crewMemberId: string,
    input: UpdateCrewMemberInput,
    meta: RequestMeta,
  ): Promise<void> {
    const member = await this.prisma.crewMember.findUnique({
      where: { id: crewMemberId },
      include: { institution: true },
    });
    if (!member) throw new NotFoundException('Crew member not found.');
    assertNetworkMember(auth, member.institution.networkId);
    assertPermission(auth, 'fleet:manage', {
      networkId: member.institution.networkId,
      institutionId: member.institutionId,
    });
    if (input.userId) await this.assertCrewAccount(input.userId, member.institutionId);

    const data: Prisma.CrewMemberUncheckedUpdateInput = {};
    for (const key of ['fullName', 'phone', 'qualification', 'userId', 'recordStatus'] as const) {
      if (input[key] !== undefined) (data as Record<string, unknown>)[key] = input[key];
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.crewMember.update({ where: { id: crewMemberId }, data });
        await this.audit.record(
          {
            action: 'crew.updated',
            entityType: 'crew_member',
            entityId: crewMemberId,
            actorId: auth.userId,
            networkId: member.institution.networkId,
            institutionId: member.institutionId,
            metadata: { fields: Object.keys(data) },
            meta,
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('That account is already linked to another crew member.');
      throw error;
    }
  }

  /** Institutions whose fleet the viewer can see: fleet viewers and dispatchers. */
  private fleetScope(auth: AuthContext, networkId: string): 'ALL' | string[] {
    const viewers = permittedInstitutionIds(auth.grants, 'fleet:view', networkId);
    const dispatchers = permittedInstitutionIds(auth.grants, 'dispatch:assign', networkId);
    if (viewers === 'ALL' || dispatchers === 'ALL') return 'ALL';
    return [...new Set([...viewers, ...dispatchers])];
  }

  private async loadProvider(auth: AuthContext, institutionId: string): Promise<Institution> {
    const provider = await this.prisma.institution.findUnique({ where: { id: institutionId } });
    if (!provider) throw new NotFoundException('Institution not found.');
    assertNetworkMember(auth, provider.networkId);
    if (provider.type !== 'AMBULANCE_PROVIDER')
      throw new BadRequestException('This applies to ambulance providers only.');
    return provider;
  }

  private async loadVehicle(auth: AuthContext, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found.');
    assertNetworkMember(auth, vehicle.networkId);
    return vehicle;
  }

  private async onTrip(vehicleId: string): Promise<boolean> {
    return (
      (await this.prisma.dispatchAssignment.count({ where: { vehicleId, status: 'CONFIRMED' } })) >
      0
    );
  }

  private async assertCrewAccount(userId: string, providerId: string): Promise<void> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, institutionId: providerId, role: 'AMBULANCE_CREW' },
    });
    if (!membership)
      throw new BadRequestException(
        'Choose an account with the ambulance crew role at this provider.',
      );
  }
}
