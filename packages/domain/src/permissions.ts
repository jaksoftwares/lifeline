import { type InstitutionType } from './institutions';

export const PERMISSIONS = [
  'referral:create',
  'referral:view',
  'referral:respond',
  'transport:request',
  'handover:sign',
  'capacity:update',
  'facility:manage',
  'dispatch:assign',
  'trip:update',
  'fleet:view',
  'fleet:manage',
  'transfers:monitor',
  'escalation:manage',
  'users:manage',
  'institutions:manage',
  'network:configure',
  'reports:view',
  'audit:view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = [
  'REFERRING_CLINICIAN',
  'REFERRAL_COORDINATOR',
  'RECEIVING_DECISION_MAKER',
  'FACILITY_ADMIN',
  'DISPATCHER',
  'AMBULANCE_CREW',
  'PROVIDER_ADMIN',
  'NETWORK_OPERATIONS',
  'NETWORK_ADMIN',
  'AUDITOR',
] as const;
export type Role = (typeof ROLES)[number];

/** Where a role is held: at a facility, at an ambulance provider, or across the whole network. */
export type RoleScope = 'FACILITY' | 'AMBULANCE_PROVIDER' | 'NETWORK';

export interface RoleDefinition {
  label: string;
  scope: RoleScope;
  requiresMfa: boolean;
  permissions: readonly Permission[];
}

export const ROLE_DEFINITIONS: Record<Role, RoleDefinition> = {
  REFERRING_CLINICIAN: {
    label: 'Referring clinician',
    scope: 'FACILITY',
    requiresMfa: false,
    permissions: ['referral:create', 'referral:view', 'transport:request'],
  },
  REFERRAL_COORDINATOR: {
    label: 'Referral coordinator',
    scope: 'FACILITY',
    requiresMfa: false,
    permissions: ['referral:create', 'referral:view', 'transport:request', 'capacity:update'],
  },
  RECEIVING_DECISION_MAKER: {
    label: 'Receiving decision-maker',
    scope: 'FACILITY',
    requiresMfa: false,
    permissions: ['referral:view', 'referral:respond', 'capacity:update', 'handover:sign'],
  },
  FACILITY_ADMIN: {
    label: 'Facility administrator',
    scope: 'FACILITY',
    requiresMfa: true,
    permissions: [
      'facility:manage',
      'capacity:update',
      'users:manage',
      'reports:view',
      'audit:view',
    ],
  },
  DISPATCHER: {
    label: 'Dispatcher',
    scope: 'AMBULANCE_PROVIDER',
    requiresMfa: false,
    permissions: ['dispatch:assign', 'fleet:view'],
  },
  AMBULANCE_CREW: {
    label: 'Ambulance crew',
    scope: 'AMBULANCE_PROVIDER',
    requiresMfa: false,
    permissions: ['trip:update'],
  },
  PROVIDER_ADMIN: {
    label: 'Provider administrator',
    scope: 'AMBULANCE_PROVIDER',
    requiresMfa: true,
    permissions: ['fleet:view', 'fleet:manage', 'users:manage', 'reports:view', 'audit:view'],
  },
  NETWORK_OPERATIONS: {
    label: 'Network operations',
    scope: 'NETWORK',
    requiresMfa: false,
    permissions: [
      'referral:view',
      // Operations teams arrange transport when a facility can't, e.g. no suitable vehicle is free.
      'transport:request',
      'transfers:monitor',
      'escalation:manage',
      'fleet:view',
      'reports:view',
    ],
  },
  NETWORK_ADMIN: {
    label: 'Network administrator',
    scope: 'NETWORK',
    requiresMfa: true,
    permissions: [
      'institutions:manage',
      'users:manage',
      'network:configure',
      'transfers:monitor',
      'reports:view',
      'audit:view',
    ],
  },
  AUDITOR: {
    label: 'Auditor',
    scope: 'NETWORK',
    requiresMfa: true,
    permissions: ['reports:view', 'audit:view'],
  },
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * Whether a role can be held at the given place. Network roles are held without an institution;
 * institution roles must match the institution's type.
 */
export function roleFitsInstitution(role: Role, institutionType: InstitutionType | null): boolean {
  const scope = ROLE_DEFINITIONS[role].scope;
  return scope === 'NETWORK' ? institutionType === null : scope === institutionType;
}

export interface MembershipGrant {
  role: Role;
  networkId: string;
  /** Null for network-wide roles. */
  institutionId: string | null;
}

export interface ScopeTarget {
  networkId: string;
  /** Omit or pass null when the target is the network itself rather than one institution. */
  institutionId?: string | null;
}

function covers(grant: MembershipGrant, target: ScopeTarget): boolean {
  if (grant.networkId !== target.networkId) return false;
  if (grant.institutionId === null) return true;
  return target.institutionId != null && grant.institutionId === target.institutionId;
}

/** True when any membership both carries the permission and covers the target. */
export function hasPermission(
  grants: readonly MembershipGrant[],
  permission: Permission,
  target: ScopeTarget,
): boolean {
  return grants.some(
    (grant) =>
      ROLE_DEFINITIONS[grant.role].permissions.includes(permission) && covers(grant, target),
  );
}

/**
 * Institutions in a network where the permission applies.
 * Returns 'ALL' when a network-wide membership carries it.
 */
export function permittedInstitutionIds(
  grants: readonly MembershipGrant[],
  permission: Permission,
  networkId: string,
): 'ALL' | string[] {
  const ids = new Set<string>();
  for (const grant of grants) {
    if (grant.networkId !== networkId) continue;
    if (!ROLE_DEFINITIONS[grant.role].permissions.includes(permission)) continue;
    if (grant.institutionId === null) return 'ALL';
    ids.add(grant.institutionId);
  }
  return [...ids];
}

/** All permissions a user holds anywhere; used to shape navigation, never to authorise. */
export function permissionSummary(grants: readonly MembershipGrant[]): Permission[] {
  const all = new Set<Permission>();
  for (const grant of grants) ROLE_DEFINITIONS[grant.role].permissions.forEach((p) => all.add(p));
  return PERMISSIONS.filter((p) => all.has(p));
}

export function requiresMfa(grants: readonly MembershipGrant[]): boolean {
  return grants.some((grant) => ROLE_DEFINITIONS[grant.role].requiresMfa);
}

/**
 * An actor may grant a role at a place only if they manage users there. Network roles can therefore
 * only be granted by network-wide user managers.
 */
export function canGrantRole(
  grants: readonly MembershipGrant[],
  role: Role,
  target: {
    networkId: string;
    institutionId: string | null;
    institutionType: InstitutionType | null;
  },
): boolean {
  if (!roleFitsInstitution(role, target.institutionType)) return false;
  return hasPermission(grants, 'users:manage', target);
}
