import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { hasPermission } from '@lifeline/domain';
import { type AuthContext, NOT_PERMITTED } from '../auth/auth-context';

export interface ReferralScope {
  networkId: string;
  referringInstitutionId: string;
  requests: { id: string; institutionId: string }[];
}

/**
 * How the viewer relates to one referral. Patient information is shared only with the referring
 * facility, the facilities it was sent to, and network operations.
 */
export interface ReferralAccess {
  /** Can act for the referring facility: edit the draft, send, withdraw, cancel, add observations. */
  isReferrer: boolean;
  /** Can see the referral as the referring facility (including read-only roles there). */
  referrerView: boolean;
  /** Network-wide oversight (network operations). */
  networkView: boolean;
  /** Requests the viewer sees as a receiving facility. */
  receivingRequestIds: string[];
  /** Requests the viewer may accept, decline or query. */
  respondableRequestIds: string[];
  canView: boolean;
  /** Sees every request, not just their own facility's. */
  seesAllRequests: boolean;
}

export function referralAccess(auth: AuthContext, referral: ReferralScope): ReferralAccess {
  const { networkId, referringInstitutionId } = referral;
  const at = (institutionId: string) => ({ networkId, institutionId });
  const networkView = auth.grants.some(
    (g) =>
      g.networkId === networkId &&
      g.institutionId === null &&
      hasPermission([g], 'referral:view', { networkId }),
  );
  const isReferrer = hasPermission(auth.grants, 'referral:create', at(referringInstitutionId));
  const referrerView =
    isReferrer || hasPermission(auth.grants, 'referral:view', at(referringInstitutionId));
  // Network-wide roles are excluded here so their institution-level checks don't widen into "receiving".
  const institutionGrants = auth.grants.filter((g) => g.institutionId !== null);
  const receivingRequestIds = referral.requests
    .filter((r) => hasPermission(institutionGrants, 'referral:view', at(r.institutionId)))
    .map((r) => r.id);
  const respondableRequestIds = referral.requests
    .filter((r) => hasPermission(institutionGrants, 'referral:respond', at(r.institutionId)))
    .map((r) => r.id);

  return {
    isReferrer,
    referrerView,
    networkView,
    receivingRequestIds,
    respondableRequestIds,
    canView: referrerView || networkView || receivingRequestIds.length > 0,
    seesAllRequests: referrerView || networkView,
  };
}

/** 404 rather than 403 so people can't probe which referrals exist. */
export function assertCanView(access: ReferralAccess): void {
  if (!access.canView) throw new NotFoundException('Referral not found.');
}

export function assertReferrer(access: ReferralAccess): void {
  assertCanView(access);
  if (!access.isReferrer) throw new ForbiddenException(NOT_PERMITTED);
}
