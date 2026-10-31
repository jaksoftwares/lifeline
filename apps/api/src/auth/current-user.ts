import { permissionSummary, ROLE_DEFINITIONS } from '@lifeline/domain';
import { type CurrentUser } from '@lifeline/schemas';
import { type Institution, type Membership, type Network, type User } from '@prisma/client';

export type UserWithMemberships = User & {
  memberships: (Membership & { network: Network; institution: Institution | null })[];
};

export const userWithMembershipsInclude = {
  memberships: { include: { network: true, institution: true } },
} as const;

export function toCurrentUser(user: UserWithMemberships): CurrentUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    mfaEnabled: user.mfaEnabled,
    memberships: user.memberships.map((m) => ({
      id: m.id,
      role: m.role,
      roleLabel: ROLE_DEFINITIONS[m.role].label,
      network: { id: m.network.id, name: m.network.name },
      institution: m.institution
        ? { id: m.institution.id, name: m.institution.name, type: m.institution.type }
        : null,
    })),
    permissions: permissionSummary(user.memberships),
  };
}
