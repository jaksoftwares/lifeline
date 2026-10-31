import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { hasPermission, type MembershipGrant } from '@lifeline/domain';
import { type AssignmentStatus } from '@prisma/client';
import { type AuthContext, NOT_PERMITTED } from '../auth/auth-context';

export interface TransferScope {
  networkId: string;
  pickupInstitutionId: string;
  destinationInstitutionId: string;
  assignments: { id: string; providerId: string | null; status: AssignmentStatus }[];
}

/**
 * How the viewer relates to one transfer. Providers see only their own assignments, and the patient's
 * name only once they've confirmed the trip; until then they see what they need to decide.
 */
export interface TransferAccess {
  /** Offer vehicles, record external transport, withdraw offers, cancel: the referring facility and network operations. */
  canArrange: boolean;
  /** Staff of the referring or receiving facility. */
  facilityView: boolean;
  /** Network-wide monitoring. */
  networkView: boolean;
  /** Providers (from this transfer's assignments) the viewer works for. */
  providerIds: string[];
  /** Assignments the viewer may confirm, decline, reassign, release or dispatch. */
  dispatchableAssignmentIds: string[];
  seesPatient: boolean;
  /** Sees every assignment, not just their own provider's. */
  seesAllAssignments: boolean;
  canViewReferral: boolean;
  canView: boolean;
}

const institutionGrants = (grants: MembershipGrant[]) =>
  grants.filter((g) => g.institutionId !== null);
const networkGrants = (grants: MembershipGrant[]) => grants.filter((g) => g.institutionId === null);

export function transferAccess(auth: AuthContext, transfer: TransferScope): TransferAccess {
  const { networkId } = transfer;
  const at = (institutionId: string) => ({ networkId, institutionId });
  const own = institutionGrants(auth.grants);
  const network = networkGrants(auth.grants);

  const canArrange = hasPermission(
    auth.grants,
    'transport:request',
    at(transfer.pickupInstitutionId),
  );
  const facilityView = [transfer.pickupInstitutionId, transfer.destinationInstitutionId].some(
    (id) =>
      hasPermission(own, 'referral:view', at(id)) ||
      hasPermission(own, 'transport:request', at(id)),
  );
  const networkView = hasPermission(network, 'transfers:monitor', { networkId });
  const networkReferralView = hasPermission(network, 'referral:view', { networkId });

  const providerIds = [
    ...new Set(
      transfer.assignments
        .map((a) => a.providerId)
        .filter((id): id is string => id !== null)
        .filter(
          (id) =>
            hasPermission(own, 'dispatch:assign', at(id)) ||
            hasPermission(own, 'fleet:view', at(id)),
        ),
    ),
  ];
  const dispatchableAssignmentIds = transfer.assignments
    .filter((a) => a.providerId && hasPermission(own, 'dispatch:assign', at(a.providerId)))
    .map((a) => a.id);
  const providerHasTrip = transfer.assignments.some(
    (a) =>
      a.providerId &&
      providerIds.includes(a.providerId) &&
      (a.status === 'CONFIRMED' || a.status === 'COMPLETED'),
  );

  const seesAllAssignments = canArrange || facilityView || networkView;
  return {
    canArrange,
    facilityView,
    networkView,
    providerIds,
    dispatchableAssignmentIds,
    seesPatient: facilityView || networkReferralView || providerHasTrip,
    seesAllAssignments,
    canViewReferral: facilityView || networkReferralView,
    canView: seesAllAssignments || providerIds.length > 0,
  };
}

/** 404 rather than 403 so people can't probe which transfers exist. */
export function assertCanViewTransfer(access: TransferAccess): void {
  if (!access.canView) throw new NotFoundException('Transfer not found.');
}

export function assertCanArrange(access: TransferAccess): void {
  assertCanViewTransfer(access);
  if (!access.canArrange) throw new ForbiddenException(NOT_PERMITTED);
}
