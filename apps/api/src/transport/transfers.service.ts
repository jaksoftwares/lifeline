import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ASSIGNMENT_DECLINE_LABELS,
  estimateDriveMinutes,
  EXTERNAL_TRANSPORT_LABELS,
  haversineKm,
  isOpenTransfer,
  OPEN_ASSIGNMENT_STATUSES,
  permittedInstitutionIds,
  PRE_COLLECTION_STATUSES,
  rankVehicles,
  TRANSPORT_PAYER_LABELS,
} from '@lifeline/domain';
import {
  type ExternalTransportInput,
  type HandoverInput,
  type ListTransfersQuery,
  type OfferVehicleInput,
  type SuggestionsResponse,
  type TransportCostInput,
  type TransferDetail,
  type TransferRequestInput,
  type TransferSummary,
  type UpdateTransferInput,
} from '@lifeline/schemas';
import { type Institution, type Prisma, type Transfer } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, NOT_PERMITTED } from '../auth/auth-context';
import { type RequestMeta } from '../common/request-meta';
import { TrackingService } from '../live/tracking.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { patientAge, patientDisplayName } from '../referrals/mappers';
import { assertCanView, referralAccess } from '../referrals/referral-access';
import {
  assignmentInclude,
  person,
  place,
  toAssignmentView,
  toCandidate,
  toTransferEventView,
  toVehicleRef,
} from './mappers';
import {
  assertCanArrange,
  assertCanViewTransfer,
  type TransferAccess,
  transferAccess,
} from './transfer-access';
import { cancelTransfer, isUniqueViolation, recordTransferEvent } from './transfer-records';

const placeWithCoordinates = {
  select: { id: true, name: true, latitude: true, longitude: true },
} as const;
const VIEW_AUDIT_INTERVAL_MS = 15 * 60 * 1000;
const LIST_LIMIT = 100;
const ALREADY_OFFERED =
  'This transfer is already offered to a vehicle or has transport arranged. Withdraw that first.';

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tracking: TrackingService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Raised by the referring facility (or network operations) once a receiving facility has accepted. */
  async create(
    auth: AuthContext,
    referralId: string,
    input: TransferRequestInput,
    meta: RequestMeta,
  ): Promise<{ id: string }> {
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
      include: { requests: true, acceptedRequest: true },
    });
    if (!referral) throw new NotFoundException('Referral not found.');
    assertCanView(referralAccess(auth, referral));
    if (
      !transferAccess(auth, { networkId: referral.networkId, ...this.scopeFor(referral) })
        .canArrange
    )
      throw new ForbiddenException(NOT_PERMITTED);
    if (referral.status !== 'ACCEPTED' || !referral.acceptedRequest) {
      throw new ConflictException(
        'Transport can be arranged once a receiving facility has accepted the referral.',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const transfer = await tx.transfer.create({
          data: {
            networkId: referral.networkId,
            referralId: referral.id,
            pickupInstitutionId: referral.referringInstitutionId,
            destinationInstitutionId: referral.acceptedRequest!.institutionId,
            requiredCapability: input.requiredCapability,
            requiredEquipment: input.requiredEquipment,
            readyAt: input.readyAt ? new Date(input.readyAt) : null,
            notes: input.notes ?? null,
            requestedById: auth.userId,
          },
        });
        await recordTransferEvent(tx, {
          transferId: transfer.id,
          type: 'REQUESTED',
          actorId: auth.userId,
          institutionId: referral.referringInstitutionId,
          at: transfer.requestedAt,
        });
        await this.auditTransfer(
          tx,
          auth,
          transfer,
          referral.reference,
          'transfer.requested',
          meta,
        );
        await this.notifications.notifyRoles(tx, {
          networkId: referral.networkId,
          institutionId: null,
          roles: ['NETWORK_OPERATIONS'],
          eventType: 'TRANSFER_REQUESTED',
          eventKey: `transfer-requested:${transfer.id}`,
          title: 'Transport requested',
          message: `Referral ${referral.reference} needs transport coordination.`,
          entityType: 'transfer',
          entityId: transfer.id,
        });
        return { id: transfer.id };
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('Transport has already been requested for this referral.');
      throw error;
    }
  }

  async update(
    auth: AuthContext,
    transferId: string,
    input: UpdateTransferInput,
    meta: RequestMeta,
  ): Promise<void> {
    const { transfer, access } = await this.load(auth, transferId);
    assertCanArrange(access);
    if (transfer.status !== 'AWAITING_TRANSPORT' || this.openAssignment(transfer)) {
      throw new ConflictException(
        'Transport needs can be changed only before the transfer is offered to a vehicle.',
      );
    }
    const data: Prisma.TransferUpdateInput = {};
    if (input.requiredCapability) data.requiredCapability = input.requiredCapability;
    if (input.requiredEquipment) data.requiredEquipment = input.requiredEquipment;
    if (input.readyAt !== undefined) data.readyAt = input.readyAt ? new Date(input.readyAt) : null;
    if (input.notes !== undefined) data.notes = input.notes;

    await this.prisma.$transaction(async (tx) => {
      await tx.transfer.update({ where: { id: transferId }, data });
      await recordTransferEvent(tx, {
        transferId,
        type: 'UPDATED',
        actorId: auth.userId,
        institutionId: transfer.pickupInstitutionId,
        metadata: { fields: Object.keys(data) },
      });
      await this.auditTransfer(
        tx,
        auth,
        transfer,
        transfer.referral.reference,
        'transfer.updated',
        meta,
      );
    });
  }

  async cancel(
    auth: AuthContext,
    transferId: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<void> {
    const { transfer, access } = await this.load(auth, transferId);
    assertCanArrange(access);
    await this.prisma.$transaction(async (tx) => {
      await cancelTransfer(tx, transferId, {
        actorId: auth.userId,
        institutionId: transfer.pickupInstitutionId,
        reason,
        at: new Date(),
      });
      await this.auditTransfer(
        tx,
        auth,
        transfer,
        transfer.referral.reference,
        'transfer.cancelled',
        meta,
      );
    });
  }

  /** Suitable vehicles across every provider in the network, ranked, each with its reasons. */
  async suggestions(auth: AuthContext, transferId: string): Promise<SuggestionsResponse> {
    const { transfer, access } = await this.load(auth, transferId);
    assertCanViewTransfer(access);
    if (!access.canArrange && !access.networkView) throw new ForbiddenException(NOT_PERMITTED);

    const [network, vehicles] = await Promise.all([
      this.prisma.network.findUniqueOrThrow({ where: { id: transfer.networkId } }),
      this.vehicleCandidates(transfer.networkId, transfer.id),
    ]);
    const ranked = rankVehicles(
      vehicles.map((v) => v.candidate),
      this.need(transfer),
      { now: new Date(), staleAfterMinutes: network.vehicleStatusStaleAfterMinutes },
    );
    const byId = new Map(vehicles.map((v) => [v.vehicle.id, v.vehicle]));
    const turnedDown = new Map(
      transfer.assignments
        .filter((a) => a.vehicleId && (a.status === 'DECLINED' || a.status === 'RELEASED'))
        .map((a) => [
          a.vehicleId!,
          a.status === 'DECLINED'
            ? 'Declined this transfer earlier'
            : 'Released this transfer earlier',
        ]),
    );

    return {
      suggestions: ranked.suggestions.map((s) => {
        const v = byId.get(s.vehicleId)!;
        const earlier = turnedDown.get(v.id);
        return {
          vehicle: toVehicleRef(v),
          provider: { id: v.institution.id, name: v.institution.name, phone: v.institution.phone },
          etaMinutes: s.etaMinutes,
          distanceKm: s.distanceKm,
          from: s.from,
          reasons: s.reasons,
          cautions: earlier ? [earlier, ...s.cautions] : s.cautions,
        };
      }),
      excluded: ranked.excluded.map((e) => {
        const v = byId.get(e.vehicleId)!;
        return {
          vehicle: toVehicleRef(v),
          provider: { id: v.institution.id, name: v.institution.name },
          reasons: e.reasons,
        };
      }),
      staleAfterMinutes: network.vehicleStatusStaleAfterMinutes,
    };
  }

  /** Offers the transfer to one suggested vehicle. Its provider must confirm before anything is assigned. */
  async offer(
    auth: AuthContext,
    transferId: string,
    input: OfferVehicleInput,
    meta: RequestMeta,
  ): Promise<{ id: string }> {
    const { transfer, access } = await this.load(auth, transferId);
    assertCanArrange(access);
    if (transfer.status !== 'AWAITING_TRANSPORT') throw new ConflictException(ALREADY_OFFERED);

    const [network, candidates] = await Promise.all([
      this.prisma.network.findUniqueOrThrow({ where: { id: transfer.networkId } }),
      this.vehicleCandidates(transfer.networkId, transfer.id, input.vehicleId),
    ]);
    const chosen = candidates[0];
    if (!chosen) throw new NotFoundException('Vehicle not found.');
    const { excluded } = rankVehicles([chosen.candidate], this.need(transfer), {
      now: new Date(),
      staleAfterMinutes: network.vehicleStatusStaleAfterMinutes,
    });
    if (excluded.length) {
      throw new ConflictException(
        `This vehicle can’t take the transfer: ${excluded[0]!.reasons.join('; ').toLowerCase()}.`,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const assignment = await tx.dispatchAssignment.create({
          data: {
            transferId,
            kind: 'PROVIDER',
            status: 'PROPOSED',
            providerId: chosen.vehicle.institutionId,
            vehicleId: chosen.vehicle.id,
            proposedById: auth.userId,
            note: input.note ?? null,
          },
        });
        await recordTransferEvent(tx, {
          transferId,
          type: 'OFFERED',
          actorId: auth.userId,
          institutionId: chosen.vehicle.institutionId,
          assignmentId: assignment.id,
          note: input.note ?? null,
          metadata: { vehicle: chosen.vehicle.registration },
        });
        await this.auditTransfer(
          tx,
          auth,
          transfer,
          transfer.referral.reference,
          'transfer.offered',
          meta,
          {
            providerId: chosen.vehicle.institutionId,
            vehicle: chosen.vehicle.registration,
          },
        );
        await this.notifications.notifyRoles(tx, {
          networkId: transfer.networkId,
          institutionId: chosen.vehicle.institutionId,
          roles: ['DISPATCHER', 'PROVIDER_ADMIN'],
          eventType: 'TRANSFER_OFFERED',
          eventKey: `transfer-offer:${assignment.id}`,
          title: 'Transport offer received',
          message: `Your vehicle has been offered for referral ${transfer.referral.reference}.`,
          entityType: 'transfer',
          entityId: transfer.id,
        });
        return { id: assignment.id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(ALREADY_OFFERED);
      throw error;
    }
  }

  /** Records transport arranged outside Lifeline (922, a county ambulance, …) so everyone can see it. */
  async recordExternal(
    auth: AuthContext,
    transferId: string,
    input: ExternalTransportInput,
    meta: RequestMeta,
  ): Promise<{ id: string }> {
    const { transfer, access } = await this.load(auth, transferId);
    assertCanArrange(access);
    if (transfer.status !== 'AWAITING_TRANSPORT') throw new ConflictException(ALREADY_OFFERED);

    const now = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const assignment = await tx.dispatchAssignment.create({
          data: {
            transferId,
            kind: 'EXTERNAL',
            status: 'CONFIRMED',
            proposedById: auth.userId,
            proposedAt: now,
            respondedById: auth.userId,
            respondedAt: now,
            note: input.note ?? null,
            externalService: input.service,
            externalProvider: input.providerName ?? null,
            externalVehicle: input.vehicleRegistration ?? null,
            externalPhone: input.contactPhone ?? null,
          },
        });
        const { count } = await tx.transfer.updateMany({
          where: { id: transferId, status: 'AWAITING_TRANSPORT' },
          data: { status: 'AMBULANCE_ASSIGNED', assignedAt: now },
        });
        if (count === 0) throw new ConflictException(ALREADY_OFFERED);
        await recordTransferEvent(tx, {
          transferId,
          type: 'EXTERNAL_ARRANGED',
          actorId: auth.userId,
          institutionId: transfer.pickupInstitutionId,
          assignmentId: assignment.id,
          note: [EXTERNAL_TRANSPORT_LABELS[input.service], input.providerName, input.note]
            .filter(Boolean)
            .join(': '),
          at: now,
        });
        await this.auditTransfer(
          tx,
          auth,
          transfer,
          transfer.referral.reference,
          'transfer.external_arranged',
          meta,
          { service: input.service },
        );
        return { id: assignment.id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(ALREADY_OFFERED);
      throw error;
    }
  }

  /**
   * The arranger takes the transfer back from a provider, e.g. no answer in time or another ambulance
   * is closer now. Allowed until the patient is collected.
   */
  async withdraw(
    auth: AuthContext,
    assignmentId: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<void> {
    const assignment = await this.prisma.dispatchAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found.');
    const { transfer, access } = await this.load(auth, assignment.transferId);
    assertCanArrange(access);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.dispatchAssignment.updateMany({
        where: { id: assignmentId, status: { in: [...OPEN_ASSIGNMENT_STATUSES] } },
        data: { status: 'WITHDRAWN', endedAt: now, endReason: reason },
      });
      if (count === 0) throw new ConflictException('This offer has already ended.');
      const moved = await tx.transfer.updateMany({
        where: { id: transfer.id, status: { in: [...PRE_COLLECTION_STATUSES] } },
        data: { status: 'AWAITING_TRANSPORT', assignedAt: null, dispatchedAt: null },
      });
      if (moved.count === 0)
        throw new ConflictException('The patient has been collected; the trip can’t be withdrawn.');
      await recordTransferEvent(tx, {
        transferId: transfer.id,
        type: 'OFFER_WITHDRAWN',
        actorId: auth.userId,
        institutionId: assignment.providerId ?? transfer.pickupInstitutionId,
        assignmentId,
        note: reason,
        at: now,
      });
      await this.auditTransfer(
        tx,
        auth,
        transfer,
        transfer.referral.reference,
        'transfer.offer_withdrawn',
        meta,
        {
          assignmentId,
        },
      );
    });
  }

  /** The receiving decision-maker signs the checklist after the ambulance has arrived. */
  async signHandover(
    auth: AuthContext,
    transferId: string,
    input: HandoverInput,
    meta: RequestMeta,
  ): Promise<void> {
    const { transfer, access } = await this.load(auth, transferId);
    assertCanViewTransfer(access);
    if (!access.canSignHandover) throw new ForbiddenException(NOT_PERMITTED);
    if (transfer.status !== 'ARRIVED')
      throw new ConflictException('Handover can be signed only after the ambulance has arrived.');

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.transfer.updateMany({
        where: { id: transferId, status: 'ARRIVED' },
        data: { status: 'HANDED_OVER', handedOverAt: now },
      });
      if (count === 0)
        throw new ConflictException('This transfer has already moved on from arrival.');
      await tx.handover.create({
        data: {
          transferId,
          ...input,
          signedById: auth.userId,
          signedAt: now,
        },
      });
      await recordTransferEvent(tx, {
        transferId,
        type: 'HANDED_OVER',
        actorId: auth.userId,
        institutionId: transfer.destinationInstitutionId,
        note: input.notes,
        at: now,
      });
      await this.audit.record(
        {
          action: 'transfer.handover_signed',
          entityType: 'transfer',
          entityId: transferId,
          actorId: auth.userId,
          networkId: transfer.networkId,
          institutionId: transfer.destinationInstitutionId,
          metadata: { reference: transfer.referral.reference },
          meta,
        },
        tx,
      );
      const message = `The receiving team signed handover for referral ${transfer.referral.reference}.`;
      await this.notifications.notifyRoles(tx, {
        networkId: transfer.networkId,
        institutionId: transfer.pickupInstitutionId,
        roles: ['REFERRING_CLINICIAN', 'REFERRAL_COORDINATOR'],
        eventType: 'TRANSFER_HANDED_OVER',
        eventKey: `transfer-handover:${transferId}:pickup`,
        title: 'Patient handover signed',
        message,
        entityType: 'transfer',
        entityId: transfer.id,
      });
      await this.notifications.notifyRoles(tx, {
        networkId: transfer.networkId,
        institutionId: null,
        roles: ['NETWORK_OPERATIONS'],
        eventType: 'TRANSFER_HANDED_OVER',
        eventKey: `transfer-handover:${transferId}:operations`,
        title: 'Patient handover signed',
        message,
        entityType: 'transfer',
        entityId: transfer.id,
      });
    });
  }

  /** Records the agreed trip cost once; Lifeline does not collect or process payment. */
  async recordCost(
    auth: AuthContext,
    transferId: string,
    input: TransportCostInput,
    meta: RequestMeta,
  ): Promise<void> {
    const { transfer, access } = await this.load(auth, transferId);
    assertCanViewTransfer(access);
    if (!access.canRecordCost) throw new ForbiddenException(NOT_PERMITTED);
    if (transfer.status !== 'ARRIVED' && transfer.status !== 'HANDED_OVER') {
      throw new ConflictException('Trip cost can be recorded after arrival and before completion.');
    }

    const now = new Date();
    const institutionId = access.canArrange
      ? transfer.pickupInstitutionId
      : (transfer.assignments.find((a) => access.dispatchableAssignmentIds.includes(a.id))
          ?.providerId ?? transfer.pickupInstitutionId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.transferCost.create({
          data: {
            transferId,
            amount: input.amount.toFixed(2),
            payer: input.payer,
            payerName: input.payerName ?? null,
            notes: input.notes ?? null,
            recordedById: auth.userId,
            recordedAt: now,
          },
        });
        await recordTransferEvent(tx, {
          transferId,
          type: 'COST_RECORDED',
          actorId: auth.userId,
          institutionId,
          note: `KES ${input.amount.toFixed(2)} recorded; payer: ${input.payerName ?? TRANSPORT_PAYER_LABELS[input.payer]}`,
          at: now,
        });
        await this.audit.record(
          {
            action: 'transfer.cost_recorded',
            entityType: 'transfer',
            entityId: transferId,
            actorId: auth.userId,
            networkId: transfer.networkId,
            institutionId,
            metadata: {
              reference: transfer.referral.reference,
              amount: input.amount.toFixed(2),
              currency: 'KES',
              payer: input.payer,
              payerName: input.payerName ?? null,
            },
            meta,
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('A trip cost has already been recorded for this transfer.');
      throw error;
    }
  }

  /** Closes the transfer and releases the confirmed vehicle after sign-off and cost recording. */
  async complete(auth: AuthContext, transferId: string, meta: RequestMeta): Promise<void> {
    const { transfer, access } = await this.load(auth, transferId);
    assertCanViewTransfer(access);
    if (!access.canSignHandover) throw new ForbiddenException(NOT_PERMITTED);
    if (transfer.status !== 'HANDED_OVER')
      throw new ConflictException('The receiving team must sign the handover first.');

    await this.prisma.$transaction(async (tx) => {
      const [handover, cost] = await Promise.all([
        tx.handover.findUnique({ where: { transferId }, select: { id: true } }),
        tx.transferCost.findUnique({ where: { transferId }, select: { id: true } }),
      ]);
      if (!handover) throw new ConflictException('A signed handover is required to complete.');
      if (!cost)
        throw new ConflictException('Record the trip cost before completing the transfer.');

      const now = new Date();
      const { count } = await tx.transfer.updateMany({
        where: { id: transferId, status: 'HANDED_OVER' },
        data: { status: 'COMPLETED', completedAt: now },
      });
      if (count === 0) throw new ConflictException('This transfer has already been completed.');
      await tx.dispatchAssignment.updateMany({
        where: { transferId, status: { in: [...OPEN_ASSIGNMENT_STATUSES] } },
        data: { status: 'COMPLETED', endedAt: now },
      });
      await recordTransferEvent(tx, {
        transferId,
        type: 'COMPLETED',
        actorId: auth.userId,
        institutionId: transfer.destinationInstitutionId,
        at: now,
      });
      await this.audit.record(
        {
          action: 'transfer.completed',
          entityType: 'transfer',
          entityId: transferId,
          actorId: auth.userId,
          networkId: transfer.networkId,
          institutionId: transfer.destinationInstitutionId,
          metadata: { reference: transfer.referral.reference },
          meta,
        },
        tx,
      );
      const message = `Transfer for referral ${transfer.referral.reference} is complete.`;
      await this.notifications.notifyRoles(tx, {
        networkId: transfer.networkId,
        institutionId: transfer.pickupInstitutionId,
        roles: ['REFERRING_CLINICIAN', 'REFERRAL_COORDINATOR'],
        eventType: 'TRANSFER_COMPLETED',
        eventKey: `transfer-completed:${transferId}:pickup`,
        title: 'Transfer completed',
        message,
        entityType: 'transfer',
        entityId: transfer.id,
      });
      await this.notifications.notifyRoles(tx, {
        networkId: transfer.networkId,
        institutionId: null,
        roles: ['NETWORK_OPERATIONS'],
        eventType: 'TRANSFER_COMPLETED',
        eventKey: `transfer-completed:${transferId}:operations`,
        title: 'Transfer completed',
        message,
        entityType: 'transfer',
        entityId: transfer.id,
      });
    });
  }

  async detail(auth: AuthContext, transferId: string, meta: RequestMeta): Promise<TransferDetail> {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: {
        referral: {
          include: { patient: true, acceptedRequest: { include: { receivingDepartment: true } } },
        },
        pickupInstitution: true,
        destinationInstitution: true,
        requestedBy: person,
        assignments: { include: assignmentInclude, orderBy: { proposedAt: 'asc' } },
        events: { include: { actor: person, institution: place }, orderBy: { occurredAt: 'asc' } },
        handover: { include: { signedBy: person } },
        cost: { include: { recordedBy: person } },
      },
    });
    if (!transfer) throw new NotFoundException('Transfer not found.');
    const access = transferAccess(auth, transfer);
    assertCanViewTransfer(access);
    if (access.seesPatient) await this.auditView(auth, transfer, transfer.referral.reference, meta);

    const assignments = transfer.assignments.filter(
      (a) =>
        access.seesAllAssignments || (a.providerId && access.providerIds.includes(a.providerId)),
    );
    const visibleIds = new Set(assignments.map((a) => a.id));
    const current = assignments.find((a) => OPEN_ASSIGNMENT_STATUSES.includes(a.status));
    const department = transfer.referral.acceptedRequest?.receivingDepartment;

    return {
      id: transfer.id,
      networkId: transfer.networkId,
      status: transfer.status,
      referral: {
        id: transfer.referral.id,
        reference: transfer.referral.reference,
        urgency: transfer.referral.urgency,
      },
      patient: access.seesPatient
        ? {
            displayName: patientDisplayName(transfer.referral.patient),
            sex: transfer.referral.patient.sex,
            ageYears: patientAge(transfer.referral.patient),
          }
        : null,
      pickup: placeView(transfer.pickupInstitution),
      destination: {
        ...placeView(transfer.destinationInstitution),
        department: department ? { name: department.name, phone: department.phone } : null,
      },
      requiredCapability: transfer.requiredCapability,
      requiredEquipment: transfer.requiredEquipment,
      readyAt: transfer.readyAt?.toISOString() ?? null,
      notes: transfer.notes,
      requestedBy: transfer.requestedBy,
      requestedAt: transfer.requestedAt.toISOString(),
      assignedAt: transfer.assignedAt?.toISOString() ?? null,
      dispatchedAt: transfer.dispatchedAt?.toISOString() ?? null,
      atPickupAt: transfer.atPickupAt?.toISOString() ?? null,
      collectedAt: transfer.collectedAt?.toISOString() ?? null,
      arrivedAt: transfer.arrivedAt?.toISOString() ?? null,
      handedOverAt: transfer.handedOverAt?.toISOString() ?? null,
      completedAt: transfer.completedAt?.toISOString() ?? null,
      cancelledAt: transfer.cancelledAt?.toISOString() ?? null,
      cancelReason: transfer.cancelReason,
      tracking: await this.tracking.forTransfer({
        id: transfer.id,
        status: transfer.status,
        pickup: transfer.pickupInstitution,
        destination: transfer.destinationInstitution,
        // Everyone sees the same position, whichever assignments they may see.
        vehicleId:
          transfer.assignments.find((a) => OPEN_ASSIGNMENT_STATUSES.includes(a.status))
            ?.vehicleId ?? null,
      }),
      handover: transfer.handover
        ? {
            patientIdentityConfirmed: transfer.handover.patientIdentityConfirmed,
            clinicalSummaryReceived: transfer.handover.clinicalSummaryReceived,
            latestObservationsReceived: transfer.handover.latestObservationsReceived,
            treatmentAndAllergiesReviewed: transfer.handover.treatmentAndAllergiesReviewed,
            documentsAndResultsAddressed: transfer.handover.documentsAndResultsAddressed,
            notes: transfer.handover.notes,
            signedAt: transfer.handover.signedAt.toISOString(),
            signedBy: transfer.handover.signedBy,
          }
        : null,
      cost: transfer.cost
        ? {
            amount: Number(transfer.cost.amount.toFixed(2)),
            currency: 'KES',
            payer: transfer.cost.payer,
            payerName: transfer.cost.payerName,
            notes: transfer.cost.notes,
            recordedAt: transfer.cost.recordedAt.toISOString(),
            recordedBy: transfer.cost.recordedBy,
          }
        : null,
      tripMinutes: tripMinutes(transfer.pickupInstitution, transfer.destinationInstitution),
      current: current ? toAssignmentView(current) : null,
      assignments: assignments.map(toAssignmentView),
      events: transfer.events
        .filter(
          (e) =>
            access.seesAllAssignments ||
            (e.assignmentId && visibleIds.has(e.assignmentId)) ||
            (!e.assignmentId && e.type !== 'UPDATED'),
        )
        .map(toTransferEventView),
      viewer: {
        canArrange: access.canArrange && isOpenTransfer(transfer.status),
        dispatchableAssignmentIds: access.dispatchableAssignmentIds.filter((id) =>
          visibleIds.has(id),
        ),
        canViewReferral: access.canViewReferral,
        canSignHandover: access.canSignHandover,
        canRecordCost: access.canRecordCost,
        canComplete: access.canSignHandover,
      },
    };
  }

  async list(auth: AuthContext, query: ListTransfersQuery): Promise<TransferSummary[]> {
    const { networkId, box, open } = query;
    const ownGrants = auth.grants.filter((g) => g.institutionId !== null);
    const ids = (permission: Parameters<typeof permittedInstitutionIds>[1]) => {
      const scope = permittedInstitutionIds(ownGrants, permission, networkId);
      return scope === 'ALL' ? [] : scope;
    };
    const openStatus: Prisma.TransferWhereInput = open
      ? { status: { notIn: ['COMPLETED', 'CANCELLED'] } }
      : {};

    let where: Prisma.TransferWhereInput;
    if (box === 'network') {
      const scope = permittedInstitutionIds(auth.grants, 'transfers:monitor', networkId);
      if (scope !== 'ALL') throw new ForbiddenException(NOT_PERMITTED);
      where = { networkId, ...openStatus };
    } else if (box === 'facility') {
      const facilities = [...new Set([...ids('referral:view'), ...ids('transport:request')])];
      if (facilities.length === 0) throw new ForbiddenException(NOT_PERMITTED);
      where = {
        networkId,
        OR: [
          { pickupInstitutionId: { in: facilities } },
          { destinationInstitutionId: { in: facilities } },
        ],
        ...openStatus,
      };
    } else {
      const providers = [...new Set([...ids('dispatch:assign'), ...ids('fleet:view')])];
      if (providers.length === 0) throw new ForbiddenException(NOT_PERMITTED);
      where = {
        networkId,
        assignments: {
          some: {
            providerId: { in: providers },
            ...(open ? { status: { in: [...OPEN_ASSIGNMENT_STATUSES] } } : {}),
          },
        },
        ...openStatus,
      };
    }

    const transfers = await this.prisma.transfer.findMany({
      where,
      include: {
        referral: { include: { patient: true } },
        pickupInstitution: placeWithCoordinates,
        destinationInstitution: placeWithCoordinates,
        assignments: {
          include: { provider: place, vehicle: { select: { registration: true } } },
          orderBy: { proposedAt: 'asc' },
        },
        handover: { select: { id: true } },
        cost: { select: { id: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: LIST_LIMIT,
    });

    const tracking = await this.tracking.forTransfers(
      transfers.map((t) => ({
        id: t.id,
        status: t.status,
        pickup: t.pickupInstitution,
        destination: t.destinationInstitution,
        vehicleId:
          t.assignments.find((a) => OPEN_ASSIGNMENT_STATUSES.includes(a.status))?.vehicleId ?? null,
      })),
    );

    return transfers.map((t) => {
      const access = transferAccess(auth, t);
      const visible = t.assignments.filter(
        (a) =>
          access.seesAllAssignments || (a.providerId && access.providerIds.includes(a.providerId)),
      );
      const current = visible.find((a) => OPEN_ASSIGNMENT_STATUSES.includes(a.status)) ?? null;
      const last = visible.at(-1);
      return {
        id: t.id,
        status: t.status,
        referral: {
          id: t.referral.id,
          reference: t.referral.reference,
          urgency: t.referral.urgency,
        },
        patient: access.seesPatient
          ? { displayName: patientDisplayName(t.referral.patient) }
          : null,
        pickup: { id: t.pickupInstitution.id, name: t.pickupInstitution.name },
        destination: { id: t.destinationInstitution.id, name: t.destinationInstitution.name },
        requiredCapability: t.requiredCapability,
        tracking: tracking.get(t.id) ?? null,
        current: current
          ? {
              status: current.status,
              kind: current.kind,
              providerName: current.provider?.name ?? current.externalProvider ?? null,
              vehicleRegistration: current.vehicle?.registration ?? current.externalVehicle ?? null,
            }
          : null,
        requestedAt: t.requestedAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        handoverRecorded: t.handover !== null,
        costRecorded: t.cost !== null,
        attention: attention(t, current, last, t.handover !== null, t.cost !== null),
        nextAction: nextAction(t, current, access, t.handover !== null, t.cost !== null),
      };
    });
  }

  /** Loads a transfer with its assignments and the viewer's relationship to it. */
  async load(auth: AuthContext, transferId: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: {
        referral: { select: { reference: true } },
        pickupInstitution: true,
        assignments: {
          select: { id: true, providerId: true, status: true, vehicleId: true, kind: true },
          orderBy: { proposedAt: 'asc' },
        },
      },
    });
    if (!transfer) throw new NotFoundException('Transfer not found.');
    const access: TransferAccess = transferAccess(auth, transfer);
    return { transfer, access };
  }

  /** Active vehicles of active providers, with whether each is busy or offered for another transfer. */
  async vehicleCandidates(networkId: string, transferId: string, vehicleId?: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        networkId,
        recordStatus: 'ACTIVE',
        institution: { status: 'ACTIVE', type: 'AMBULANCE_PROVIDER' },
        ...(vehicleId ? { id: vehicleId } : {}),
      },
      include: {
        institution: true,
        assignments: {
          where: { status: { in: [...OPEN_ASSIGNMENT_STATUSES] } },
          select: { id: true, status: true, transferId: true },
        },
      },
    });
    return vehicles.map((vehicle) => ({
      vehicle,
      candidate: toCandidate(vehicle, {
        busy: vehicle.assignments.some((a) => a.status === 'CONFIRMED'),
        offeredElsewhere: vehicle.assignments.some(
          (a) => a.status === 'PROPOSED' && a.transferId !== transferId,
        ),
      }),
    }));
  }

  need(transfer: Transfer & { pickupInstitution: Institution }) {
    const p = transfer.pickupInstitution;
    return {
      capability: transfer.requiredCapability,
      equipment: transfer.requiredEquipment,
      pickup:
        p.latitude != null && p.longitude != null
          ? { latitude: p.latitude, longitude: p.longitude }
          : null,
    };
  }

  private openAssignment(transfer: { assignments: { status: string }[] }) {
    return transfer.assignments.find((a) =>
      (OPEN_ASSIGNMENT_STATUSES as readonly string[]).includes(a.status),
    );
  }

  private scopeFor(referral: {
    acceptedRequest: { institutionId: string } | null;
    referringInstitutionId: string;
  }) {
    return {
      pickupInstitutionId: referral.referringInstitutionId,
      destinationInstitutionId:
        referral.acceptedRequest?.institutionId ?? referral.referringInstitutionId,
      assignments: [],
    };
  }

  auditTransfer(
    tx: Prisma.TransactionClient,
    auth: AuthContext,
    transfer: { id: string; networkId: string; pickupInstitutionId: string },
    reference: string,
    action: string,
    meta: RequestMeta,
    metadata: Record<string, unknown> = {},
    institutionId: string = transfer.pickupInstitutionId,
  ) {
    return this.audit.record(
      {
        action,
        entityType: 'transfer',
        entityId: transfer.id,
        actorId: auth.userId,
        networkId: transfer.networkId,
        institutionId,
        metadata: { reference, ...metadata },
        meta,
      },
      tx,
    );
  }

  /** Records who saw patient details on a transfer, at most once per person every 15 minutes. */
  private async auditView(
    auth: AuthContext,
    transfer: { id: string; networkId: string },
    reference: string,
    meta: RequestMeta,
  ) {
    const recent = await this.prisma.auditEvent.findFirst({
      where: {
        action: 'transfer.viewed',
        actorId: auth.userId,
        entityId: transfer.id,
        occurredAt: { gt: new Date(Date.now() - VIEW_AUDIT_INTERVAL_MS) },
      },
      select: { id: true },
    });
    if (recent) return;
    await this.audit.record({
      action: 'transfer.viewed',
      entityType: 'transfer',
      entityId: transfer.id,
      actorId: auth.userId,
      networkId: transfer.networkId,
      metadata: { reference },
      meta,
    });
  }
}

function placeView(i: Institution) {
  return { id: i.id, name: i.name, phone: i.phone, latitude: i.latitude, longitude: i.longitude };
}

function tripMinutes(a: Institution, b: Institution): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null)
    return null;
  return estimateDriveMinutes(
    haversineKm(
      { latitude: a.latitude, longitude: a.longitude },
      { latitude: b.latitude, longitude: b.longitude },
    ),
  );
}

type SummaryAssignment = {
  status: string;
  declineReason: keyof typeof ASSIGNMENT_DECLINE_LABELS | null;
  provider: { name: string } | null;
};

/** Why network operations or the referring facility should look at a transfer now. */
function attention(
  t: { status: string },
  current: SummaryAssignment | null,
  last: SummaryAssignment | undefined,
  handoverRecorded: boolean,
  costRecorded: boolean,
): string | null {
  if (t.status === 'ARRIVED' && !handoverRecorded) return 'Awaiting receiving handover';
  if (t.status === 'HANDED_OVER' && !costRecorded) return 'Trip cost not yet recorded';
  if (t.status === 'HANDED_OVER' && costRecorded) return 'Ready to complete transfer';
  if (t.status !== 'AWAITING_TRANSPORT') return null;
  if (current) return `Awaiting confirmation from ${current.provider?.name ?? 'the provider'}`;
  if (last?.status === 'DECLINED')
    return `Declined by ${last.provider?.name ?? 'the provider'}${last.declineReason ? `: ${ASSIGNMENT_DECLINE_LABELS[last.declineReason].toLowerCase()}` : ''}`;
  if (last?.status === 'RELEASED') return `Released by ${last.provider?.name ?? 'the provider'}`;
  return 'No vehicle offered yet';
}

function nextAction(
  t: { status: string },
  current: { id: string; status: string; kind: string } | null,
  access: TransferAccess,
  handoverRecorded: boolean,
  costRecorded: boolean,
): string | null {
  if (t.status === 'AWAITING_TRANSPORT' && !current && access.canArrange) return 'Offer a vehicle';
  if (t.status === 'ARRIVED' && access.canSignHandover && !handoverRecorded) return 'Sign handover';
  if (
    (t.status === 'ARRIVED' || t.status === 'HANDED_OVER') &&
    access.canRecordCost &&
    !costRecorded
  )
    return 'Record trip cost';
  if (t.status === 'HANDED_OVER' && access.canSignHandover && costRecorded)
    return 'Complete transfer';
  if (current && access.dispatchableAssignmentIds.includes(current.id)) {
    if (current.status === 'PROPOSED') return 'Confirm or decline';
    if (t.status === 'AMBULANCE_ASSIGNED') return 'Dispatch the ambulance';
  }
  if (current?.kind === 'EXTERNAL' && t.status === 'AMBULANCE_ASSIGNED' && access.canArrange)
    return 'Mark as dispatched';
  return null;
}
