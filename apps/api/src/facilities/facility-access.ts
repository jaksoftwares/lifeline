import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { hasPermission } from '@lifeline/domain';
import { type Institution } from '@prisma/client';
import { assertNetworkMember, type AuthContext, NOT_PERMITTED } from '../auth/auth-context';
import { PrismaService } from '../prisma/prisma.service';

/** Loads an institution the caller can see (any member of its network), or throws 404/403. */
export async function loadVisibleInstitution(
  prisma: PrismaService,
  auth: AuthContext,
  institutionId: string,
): Promise<Institution> {
  const institution = await prisma.institution.findUnique({ where: { id: institutionId } });
  if (!institution) throw new NotFoundException('Institution not found.');
  assertNetworkMember(auth, institution.networkId);
  return institution;
}

/**
 * Who may edit an institution's profile: its own administrators (facility or provider) and
 * network administrators.
 */
export function assertCanManageInstitution(auth: AuthContext, institution: Institution): void {
  const target = { networkId: institution.networkId, institutionId: institution.id };
  const ownAdmin =
    institution.type === 'FACILITY'
      ? hasPermission(auth.grants, 'facility:manage', target)
      : hasPermission(auth.grants, 'fleet:manage', target);
  if (!ownAdmin && !hasPermission(auth.grants, 'institutions:manage', target)) {
    throw new ForbiddenException(NOT_PERMITTED);
  }
}

export function assertFacility(institution: Institution): void {
  if (institution.type !== 'FACILITY') {
    throw new BadRequestException('This applies to healthcare facilities only.');
  }
}
