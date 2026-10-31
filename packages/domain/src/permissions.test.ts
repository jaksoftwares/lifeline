import { describe, expect, it } from 'vitest';
import {
  canGrantRole,
  hasPermission,
  type MembershipGrant,
  permissionSummary,
  permittedInstitutionIds,
  requiresMfa,
  roleFitsInstitution,
} from './permissions';

const NET = 'net-1';
const OTHER_NET = 'net-2';
const FAC_A = 'fac-a';
const FAC_B = 'fac-b';
const PROVIDER = 'prov-1';

const facilityAdminA: MembershipGrant = {
  role: 'FACILITY_ADMIN',
  networkId: NET,
  institutionId: FAC_A,
};
const networkAdmin: MembershipGrant = {
  role: 'NETWORK_ADMIN',
  networkId: NET,
  institutionId: null,
};
const clinicianA: MembershipGrant = {
  role: 'REFERRING_CLINICIAN',
  networkId: NET,
  institutionId: FAC_A,
};

describe('hasPermission', () => {
  it('limits institution roles to their own institution', () => {
    expect(
      hasPermission([facilityAdminA], 'users:manage', { networkId: NET, institutionId: FAC_A }),
    ).toBe(true);
    expect(
      hasPermission([facilityAdminA], 'users:manage', { networkId: NET, institutionId: FAC_B }),
    ).toBe(false);
  });

  it('does not let institution roles act on the network as a whole', () => {
    expect(hasPermission([facilityAdminA], 'users:manage', { networkId: NET })).toBe(false);
  });

  it('lets network roles act on every institution in their network only', () => {
    expect(
      hasPermission([networkAdmin], 'users:manage', { networkId: NET, institutionId: FAC_B }),
    ).toBe(true);
    expect(hasPermission([networkAdmin], 'users:manage', { networkId: NET })).toBe(true);
    expect(hasPermission([networkAdmin], 'users:manage', { networkId: OTHER_NET })).toBe(false);
  });

  it('requires the role to carry the permission', () => {
    expect(
      hasPermission([clinicianA], 'users:manage', { networkId: NET, institutionId: FAC_A }),
    ).toBe(false);
    expect(
      hasPermission([clinicianA], 'referral:create', { networkId: NET, institutionId: FAC_A }),
    ).toBe(true);
  });
});

describe('permittedInstitutionIds', () => {
  it('returns ALL for network-wide grants', () => {
    expect(permittedInstitutionIds([networkAdmin, facilityAdminA], 'audit:view', NET)).toBe('ALL');
  });

  it('returns the specific institutions otherwise', () => {
    const adminB: MembershipGrant = { ...facilityAdminA, institutionId: FAC_B };
    expect(
      permittedInstitutionIds([facilityAdminA, adminB, clinicianA], 'users:manage', NET),
    ).toEqual([FAC_A, FAC_B]);
  });

  it('returns nothing for another network', () => {
    expect(permittedInstitutionIds([facilityAdminA], 'users:manage', OTHER_NET)).toEqual([]);
  });
});

describe('roleFitsInstitution', () => {
  it('matches role scope to institution type', () => {
    expect(roleFitsInstitution('REFERRING_CLINICIAN', 'FACILITY')).toBe(true);
    expect(roleFitsInstitution('REFERRING_CLINICIAN', 'AMBULANCE_PROVIDER')).toBe(false);
    expect(roleFitsInstitution('DISPATCHER', 'AMBULANCE_PROVIDER')).toBe(true);
    expect(roleFitsInstitution('NETWORK_ADMIN', null)).toBe(true);
    expect(roleFitsInstitution('NETWORK_ADMIN', 'FACILITY')).toBe(false);
  });
});

describe('canGrantRole', () => {
  it('lets a facility admin grant facility roles at their facility', () => {
    const target = { networkId: NET, institutionId: FAC_A, institutionType: 'FACILITY' as const };
    expect(canGrantRole([facilityAdminA], 'REFERRING_CLINICIAN', target)).toBe(true);
  });

  it('stops a facility admin granting roles elsewhere or network roles', () => {
    expect(
      canGrantRole([facilityAdminA], 'REFERRING_CLINICIAN', {
        networkId: NET,
        institutionId: FAC_B,
        institutionType: 'FACILITY',
      }),
    ).toBe(false);
    expect(
      canGrantRole([facilityAdminA], 'NETWORK_ADMIN', {
        networkId: NET,
        institutionId: null,
        institutionType: null,
      }),
    ).toBe(false);
  });

  it('rejects roles that do not fit the institution type', () => {
    expect(
      canGrantRole([networkAdmin], 'DISPATCHER', {
        networkId: NET,
        institutionId: FAC_A,
        institutionType: 'FACILITY',
      }),
    ).toBe(false);
    expect(
      canGrantRole([networkAdmin], 'DISPATCHER', {
        networkId: NET,
        institutionId: PROVIDER,
        institutionType: 'AMBULANCE_PROVIDER',
      }),
    ).toBe(true);
  });
});

describe('summaries', () => {
  it('collects permissions across memberships in a stable order', () => {
    expect(permissionSummary([clinicianA])).toEqual([
      'referral:create',
      'referral:view',
      'transport:request',
    ]);
  });

  it('requires MFA when any role demands it', () => {
    expect(requiresMfa([clinicianA])).toBe(false);
    expect(requiresMfa([clinicianA, facilityAdminA])).toBe(true);
  });
});
