import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  hasPermission,
  INSTITUTION_TYPE_LABELS,
  type InstitutionType,
  permittedInstitutionIds,
  ROLE_DEFINITIONS,
  roleFitsInstitution,
} from '@lifeline/domain';
import { type CreateUserInput, type MembershipInput, type UserSummary } from '@lifeline/schemas';
import { type Institution, type Membership, Prisma, type User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, NOT_PERMITTED } from '../auth/auth-context';
import { hashPassword } from '../auth/passwords';
import { TokenService } from '../auth/token.service';
import { type RequestMeta } from '../common/request-meta';
import { PrismaService } from '../prisma/prisma.service';

type UserWithScopedMemberships = User & {
  memberships: (Membership & { institution: Institution | null })[];
};

const OUTSIDE_SCOPE = 'This person also holds roles you don’t manage. Ask a network administrator.';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
  ) {}

  /** Users holding a role somewhere the caller manages users. Only memberships inside that scope are shown. */
  async list(
    auth: AuthContext,
    query: { networkId: string; institutionId?: string },
  ): Promise<UserSummary[]> {
    const scope = permittedInstitutionIds(auth.grants, 'users:manage', query.networkId);
    if (scope !== 'ALL' && scope.length === 0) throw new ForbiddenException(NOT_PERMITTED);
    if (query.institutionId && scope !== 'ALL' && !scope.includes(query.institutionId)) {
      throw new ForbiddenException(NOT_PERMITTED);
    }

    const membershipWhere: Prisma.MembershipWhereInput = {
      networkId: query.networkId,
      ...(query.institutionId
        ? { institutionId: query.institutionId }
        : scope === 'ALL'
          ? {}
          : { institutionId: { in: scope } }),
    };

    const users = await this.prisma.user.findMany({
      where: { memberships: { some: membershipWhere } },
      include: { memberships: { where: membershipWhere, include: { institution: true } } },
      orderBy: { fullName: 'asc' },
    });
    return users.map(toUserSummary);
  }

  async create(auth: AuthContext, input: CreateUserInput, meta: RequestMeta): Promise<UserSummary> {
    const target = await this.authorizeGrant(auth, input.membership);

    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Some fields need attention.',
        errors: [{ path: 'email', message: 'A user with this email already exists.' }],
      });
    }

    const passwordHash = await hashPassword(input.temporaryPassword);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          fullName: input.fullName,
          email: input.email,
          phone: input.phone ?? null,
          passwordHash,
          mustChangePassword: true,
          memberships: {
            create: {
              networkId: input.membership.networkId,
              institutionId: input.membership.institutionId,
              role: input.membership.role,
              grantedById: auth.userId,
            },
          },
        },
        include: { memberships: { include: { institution: true } } },
      });
      await this.audit.record(
        {
          action: 'user.created',
          entityType: 'user',
          entityId: created.id,
          actorId: auth.userId,
          networkId: target.networkId,
          institutionId: target.institutionId,
          metadata: { email: created.email },
          meta,
        },
        tx,
      );
      await this.recordGrant(tx, auth, created.memberships[0]!, meta);
      return created;
    });
    return toUserSummary(user);
  }

  async addMembership(
    auth: AuthContext,
    userId: string,
    input: MembershipInput,
    meta: RequestMeta,
  ): Promise<UserSummary> {
    await this.authorizeGrant(auth, input);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    const duplicate = await this.prisma.membership.findFirst({
      where: {
        userId,
        networkId: input.networkId,
        institutionId: input.institutionId,
        role: input.role,
      },
    });
    if (duplicate) throw new ConflictException('This person already holds that role there.');

    await this.prisma.$transaction(async (tx) => {
      const membership = await tx.membership.create({
        data: {
          userId,
          networkId: input.networkId,
          institutionId: input.institutionId,
          role: input.role,
          grantedById: auth.userId,
        },
      });
      await this.recordGrant(tx, auth, membership, meta);
    });
    return this.scopedSummary(auth, userId, input.networkId);
  }

  async revokeMembership(
    auth: AuthContext,
    membershipId: string,
    meta: RequestMeta,
  ): Promise<void> {
    const membership = await this.prisma.membership.findUnique({ where: { id: membershipId } });
    if (!membership) throw new NotFoundException('Role not found.');
    if (!hasPermission(auth.grants, 'users:manage', membership))
      throw new ForbiddenException(NOT_PERMITTED);
    if (
      membership.userId === auth.userId &&
      ROLE_DEFINITIONS[membership.role].permissions.includes('users:manage')
    ) {
      throw new BadRequestException(
        'You can’t remove your own administrator role. Ask another administrator.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.membership.delete({ where: { id: membershipId } });
      await this.audit.record(
        {
          action: 'membership.revoked',
          entityType: 'membership',
          entityId: membershipId,
          actorId: auth.userId,
          networkId: membership.networkId,
          institutionId: membership.institutionId,
          metadata: { userId: membership.userId, role: membership.role },
          meta,
        },
        tx,
      );
    });
  }

  async setStatus(
    auth: AuthContext,
    userId: string,
    status: 'ACTIVE' | 'DEACTIVATED',
    meta: RequestMeta,
  ): Promise<void> {
    if (userId === auth.userId)
      throw new BadRequestException('You can’t change the status of your own account.');
    const user = await this.loadFullyManagedUser(auth, userId);

    await this.prisma.user.update({
      where: { id: userId },
      data: status === 'ACTIVE' ? { status, failedLoginCount: 0, lockedUntil: null } : { status },
    });
    if (status === 'DEACTIVATED') await this.tokens.revokeAllForUser(userId, 'user_deactivated');
    await this.recordPerNetwork(
      auth,
      user,
      status === 'ACTIVE' ? 'user.reactivated' : 'user.deactivated',
      meta,
    );
  }

  /** For a lost or replaced phone. The user sets up their authenticator again at next sign-in. */
  async resetMfa(auth: AuthContext, userId: string, meta: RequestMeta): Promise<void> {
    const user = await this.loadFullyManagedUser(auth, userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaPendingSecret: null, mfaLastUsedStep: null },
    });
    await this.tokens.revokeAllForUser(userId, 'mfa_reset');
    await this.recordPerNetwork(auth, user, 'user.mfa_reset', meta);
  }

  /** Validates the place and role, then checks the caller may grant it there. */
  private async authorizeGrant(
    auth: AuthContext,
    input: MembershipInput,
  ): Promise<{
    networkId: string;
    institutionId: string | null;
    institutionType: InstitutionType | null;
  }> {
    let institutionType: InstitutionType | null = null;
    if (input.institutionId) {
      const institution = await this.prisma.institution.findUnique({
        where: { id: input.institutionId },
      });
      if (!institution || institution.networkId !== input.networkId) {
        throw new BadRequestException('That institution is not part of this network.');
      }
      institutionType = institution.type;
    }

    const role = ROLE_DEFINITIONS[input.role];
    if (!roleFitsInstitution(input.role, institutionType)) {
      throw new BadRequestException(
        role.scope === 'NETWORK'
          ? `${role.label} is a network-wide role and can’t be assigned to one institution.`
          : `${role.label} can only be held at a ${INSTITUTION_TYPE_LABELS[role.scope].toLowerCase()}.`,
      );
    }

    const target = {
      networkId: input.networkId,
      institutionId: input.institutionId,
      institutionType,
    };
    if (!hasPermission(auth.grants, 'users:manage', target))
      throw new ForbiddenException(NOT_PERMITTED);
    return target;
  }

  /** Deactivation and MFA reset affect every role, so the caller must manage all of them. */
  private async loadFullyManagedUser(auth: AuthContext, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: true },
    });
    if (!user) throw new NotFoundException('User not found.');
    const managed = user.memberships.map((m) => hasPermission(auth.grants, 'users:manage', m));
    if (managed.length === 0 || !managed.some(Boolean)) throw new ForbiddenException(NOT_PERMITTED);
    if (!managed.every(Boolean)) throw new ForbiddenException(OUTSIDE_SCOPE);
    return user;
  }

  private async recordGrant(
    db: Prisma.TransactionClient,
    auth: AuthContext,
    membership: Membership,
    meta: RequestMeta,
  ) {
    await this.audit.record(
      {
        action: 'membership.granted',
        entityType: 'membership',
        entityId: membership.id,
        actorId: auth.userId,
        networkId: membership.networkId,
        institutionId: membership.institutionId,
        metadata: { userId: membership.userId, role: membership.role },
        meta,
      },
      db,
    );
  }

  private async recordPerNetwork(
    auth: AuthContext,
    user: User & { memberships: Membership[] },
    action: string,
    meta: RequestMeta,
  ) {
    for (const networkId of new Set(user.memberships.map((m) => m.networkId))) {
      await this.audit.record({
        action,
        entityType: 'user',
        entityId: user.id,
        actorId: auth.userId,
        networkId,
        meta,
      });
    }
  }

  private async scopedSummary(
    auth: AuthContext,
    userId: string,
    networkId: string,
  ): Promise<UserSummary> {
    const scope = permittedInstitutionIds(auth.grants, 'users:manage', networkId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { networkId, ...(scope === 'ALL' ? {} : { institutionId: { in: scope } }) },
          include: { institution: true },
        },
      },
    });
    return toUserSummary(user);
  }
}

function toUserSummary(user: UserWithScopedMemberships): UserSummary {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    status: user.status,
    mfaEnabled: user.mfaEnabled,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    memberships: user.memberships.map((m) => ({
      id: m.id,
      role: m.role,
      roleLabel: ROLE_DEFINITIONS[m.role].label,
      institution: m.institution
        ? { id: m.institution.id, name: m.institution.name, type: m.institution.type }
        : null,
    })),
  };
}
