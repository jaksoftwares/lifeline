import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ASSIGNMENT_DECLINE_LABELS, rankVehicles } from '@lifeline/domain';
import {
  type ConfirmAssignmentInput,
  type DeclineAssignmentInput,
  type ReassignInput,
} from '@lifeline/schemas';
import { type DispatchAssignment, type Prisma } from '@prisma/client';
import { type AuthContext, NOT_PERMITTED } from '../auth/auth-context';
import { type RequestMeta } from '../common/request-meta';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanViewTransfer } from './transfer-access';
import { isUniqueViolation, recordTransferEvent } from './transfer-records';
import { TransfersService } from './transfers.service';

const VEHICLE_TAKEN = 'This vehicle has just been confirmed for another transfer. Choose another.';

/**
 * The provider's side of a transfer. Nothing is assigned until a dispatcher at the provider confirms
 * the vehicle and names the crew, which also confirms that the vehicle really is available.
 */
@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transfers: TransfersService,
  ) {}

  async confirm(
    auth: AuthContext,
    assignmentId: string,
    input: ConfirmAssignmentInput,
    meta: RequestMeta,
  ): Promise<void> {
    const { assignment, transfer } = await this.loadForDispatcher(auth, assignmentId);
    if (assignment.status !== 'PROPOSED' || transfer.status !== 'AWAITING_TRANSPORT')
      throw new ConflictException('This offer has already been answered or withdrawn.');
    const vehicle = await this.assertSuitableVehicle(transfer, assignment, input.vehicleId);
    await this.assertCrew(assignment, input.crewMemberIds);

    const now = new Date();
    const substituted = vehicle.id !== assignment.vehicleId;
    try {
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.dispatchAssignment.updateMany({
          where: { id: assignmentId, status: 'PROPOSED' },
          data: {
            status: 'CONFIRMED',
            vehicleId: vehicle.id,
            respondedById: auth.userId,
            respondedAt: now,
            responseNote: input.note ?? null,
            etaMinutes: input.etaMinutes ?? null,
          },
        });
        if (count === 0)
          throw new ConflictException('This offer has already been answered or withdrawn.');
        await tx.assignmentCrew.createMany({
          data: input.crewMemberIds.map((crewMemberId) => ({ assignmentId, crewMemberId })),
        });
        const moved = await tx.transfer.updateMany({
          where: { id: transfer.id, status: 'AWAITING_TRANSPORT' },
          data: { status: 'AMBULANCE_ASSIGNED', assignedAt: now },
        });
        if (moved.count === 0)
          throw new ConflictException('This transfer is no longer awaiting transport.');
        await this.confirmAvailability(tx, vehicle.id, auth.userId, now);
        await recordTransferEvent(tx, {
          transferId: transfer.id,
          type: 'CONFIRMED',
          actorId: auth.userId,
          institutionId: assignment.providerId,
          assignmentId,
          note: [
            substituted ? `Vehicle changed to ${vehicle.registration}` : null,
            input.etaMinutes ? `About ${input.etaMinutes} min to pickup` : null,
            input.note,
          ]
            .filter(Boolean)
            .join('. '),
          metadata: {
            vehicle: vehicle.registration,
            crew: input.crewMemberIds.length,
            substituted,
          },
          at: now,
        });
        await this.transfers.auditTransfer(
          tx,
          auth,
          transfer,
          transfer.referral.reference,
          'transfer.confirmed',
          meta,
          { vehicle: vehicle.registration },
          assignment.providerId!,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(VEHICLE_TAKEN);
      throw error;
    }
  }

  async decline(
    auth: AuthContext,
    assignmentId: string,
    input: DeclineAssignmentInput,
    meta: RequestMeta,
  ): Promise<void> {
    const { assignment, transfer } = await this.loadForDispatcher(auth, assignmentId);
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.dispatchAssignment.updateMany({
        where: { id: assignmentId, status: 'PROPOSED' },
        data: {
          status: 'DECLINED',
          respondedById: auth.userId,
          respondedAt: now,
          declineReason: input.reason,
          responseNote: input.note ?? null,
          endedAt: now,
        },
      });
      if (count === 0)
        throw new ConflictException('This offer has already been answered or withdrawn.');
      await recordTransferEvent(tx, {
        transferId: transfer.id,
        type: 'DECLINED',
        actorId: auth.userId,
        institutionId: assignment.providerId,
        assignmentId,
        note: [ASSIGNMENT_DECLINE_LABELS[input.reason], input.note].filter(Boolean).join(': '),
        metadata: { reason: input.reason },
        at: now,
      });
      await this.transfers.auditTransfer(
        tx,
        auth,
        transfer,
        transfer.referral.reference,
        'transfer.declined',
        meta,
        { reason: input.reason },
        assignment.providerId!,
      );
    });
  }

  /**
   * Swaps the vehicle or crew on a confirmed trip, e.g. after a breakdown before reaching the patient.
   * A dispatched trip that changes vehicle goes back to "Ambulance assigned" until the new one leaves.
   */
  async reassign(
    auth: AuthContext,
    assignmentId: string,
    input: ReassignInput,
    meta: RequestMeta,
  ): Promise<void> {
    const { assignment, transfer } = await this.loadForDispatcher(auth, assignmentId);
    if (
      assignment.status !== 'CONFIRMED' ||
      (transfer.status !== 'AMBULANCE_ASSIGNED' && transfer.status !== 'DISPATCHED')
    ) {
      throw new ConflictException(
        'Only confirmed trips that haven’t reached the patient can be reassigned.',
      );
    }
    const vehicle = await this.assertSuitableVehicle(transfer, assignment, input.vehicleId);
    await this.assertCrew(assignment, input.crewMemberIds);
    const vehicleChanged = vehicle.id !== assignment.vehicleId;
    const previous = assignment.vehicleId
      ? await this.prisma.vehicle.findUnique({ where: { id: assignment.vehicleId } })
      : null;

    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.dispatchAssignment.update({
          where: { id: assignmentId },
          data: { vehicleId: vehicle.id },
        });
        await tx.assignmentCrew.deleteMany({ where: { assignmentId } });
        await tx.assignmentCrew.createMany({
          data: input.crewMemberIds.map((crewMemberId) => ({ assignmentId, crewMemberId })),
        });
        if (vehicleChanged && transfer.status === 'DISPATCHED') {
          await tx.transfer.updateMany({
            where: { id: transfer.id, status: 'DISPATCHED' },
            data: { status: 'AMBULANCE_ASSIGNED', dispatchedAt: null },
          });
        }
        if (vehicleChanged) await this.confirmAvailability(tx, vehicle.id, auth.userId, now);
        await recordTransferEvent(tx, {
          transferId: transfer.id,
          type: 'REASSIGNED',
          actorId: auth.userId,
          institutionId: assignment.providerId,
          assignmentId,
          note: [
            vehicleChanged
              ? `Vehicle changed from ${previous?.registration ?? 'none'} to ${vehicle.registration}`
              : 'Crew changed',
            input.reason,
          ].join('. '),
          metadata: { from: previous?.registration ?? null, to: vehicle.registration },
          at: now,
        });
        await this.transfers.auditTransfer(
          tx,
          auth,
          transfer,
          transfer.referral.reference,
          'transfer.reassigned',
          meta,
          { vehicle: vehicle.registration },
          assignment.providerId!,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(VEHICLE_TAKEN);
      throw error;
    }
  }

  /** The provider can no longer do the trip. The transfer goes back to awaiting transport. */
  async release(
    auth: AuthContext,
    assignmentId: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<void> {
    const { assignment, transfer } = await this.loadForDispatcher(auth, assignmentId);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.dispatchAssignment.updateMany({
        where: { id: assignmentId, status: 'CONFIRMED' },
        data: { status: 'RELEASED', endedAt: now, endReason: reason },
      });
      if (count === 0) throw new ConflictException('Only confirmed trips can be released.');
      const moved = await tx.transfer.updateMany({
        where: { id: transfer.id, status: { in: ['AMBULANCE_ASSIGNED', 'DISPATCHED'] } },
        data: { status: 'AWAITING_TRANSPORT', assignedAt: null, dispatchedAt: null },
      });
      if (moved.count === 0) {
        throw new ConflictException(
          'The ambulance has reached the patient. Report an interruption from the crew app instead.',
        );
      }
      await recordTransferEvent(tx, {
        transferId: transfer.id,
        type: 'RELEASED',
        actorId: auth.userId,
        institutionId: assignment.providerId,
        assignmentId,
        note: reason,
        at: now,
      });
      await this.transfers.auditTransfer(
        tx,
        auth,
        transfer,
        transfer.referral.reference,
        'transfer.released',
        meta,
        {},
        assignment.providerId!,
      );
    });
  }

  /**
   * The ambulance has left for the pickup. Done by the provider's dispatcher, or by the arranger for
   * transport recorded outside Lifeline.
   */
  async dispatch(auth: AuthContext, assignmentId: string, meta: RequestMeta): Promise<void> {
    const assignment = await this.prisma.dispatchAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found.');
    const { transfer, access } = await this.transfers.load(auth, assignment.transferId);
    assertCanViewTransfer(access);
    const allowed =
      assignment.kind === 'EXTERNAL'
        ? access.canArrange
        : access.dispatchableAssignmentIds.includes(assignmentId);
    if (!allowed) throw new ForbiddenException(NOT_PERMITTED);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.dispatchAssignment.findUnique({ where: { id: assignmentId } });
      if (current?.status !== 'CONFIRMED')
        throw new ConflictException('Only confirmed trips can be dispatched.');
      const { count } = await tx.transfer.updateMany({
        where: { id: transfer.id, status: 'AMBULANCE_ASSIGNED' },
        data: { status: 'DISPATCHED', dispatchedAt: now },
      });
      if (count === 0) throw new ConflictException('This ambulance has already been dispatched.');
      await recordTransferEvent(tx, {
        transferId: transfer.id,
        type: 'DISPATCHED',
        actorId: auth.userId,
        institutionId: assignment.providerId ?? transfer.pickupInstitutionId,
        assignmentId,
        at: now,
      });
      await this.transfers.auditTransfer(
        tx,
        auth,
        transfer,
        transfer.referral.reference,
        'transfer.dispatched',
        meta,
        {},
        assignment.providerId ?? transfer.pickupInstitutionId,
      );
    });
  }

  private async loadForDispatcher(auth: AuthContext, assignmentId: string) {
    const assignment = await this.prisma.dispatchAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found.');
    const { transfer, access } = await this.transfers.load(auth, assignment.transferId);
    assertCanViewTransfer(access);
    if (assignment.kind !== 'PROVIDER' || !access.dispatchableAssignmentIds.includes(assignmentId))
      throw new ForbiddenException(NOT_PERMITTED);
    return { assignment, transfer };
  }

  /**
   * The vehicle must belong to the provider and meet the transfer's needs. Availability is not checked
   * against the stale limit: the dispatcher choosing it is confirming it's available now.
   */
  private async assertSuitableVehicle(
    transfer: Awaited<ReturnType<TransfersService['load']>>['transfer'],
    assignment: DispatchAssignment,
    vehicleId: string,
  ) {
    const [entry] = await this.transfers.vehicleCandidates(
      transfer.networkId,
      transfer.id,
      vehicleId,
    );
    if (!entry || entry.vehicle.institutionId !== assignment.providerId)
      throw new BadRequestException('Choose one of your own active vehicles.');
    const otherTrip = entry.vehicle.assignments.some(
      (a) => a.status === 'CONFIRMED' && a.id !== assignment.id,
    );
    if (entry.vehicle.status === 'OUT_OF_SERVICE')
      throw new ConflictException('This vehicle is marked out of service.');
    const { excluded } = rankVehicles(
      [{ ...entry.candidate, status: 'AVAILABLE', statusUpdatedAt: new Date(), busy: otherTrip }],
      this.transfers.need(transfer),
      { now: new Date(), staleAfterMinutes: Number.MAX_SAFE_INTEGER },
    );
    if (excluded.length) {
      throw new ConflictException(
        `This vehicle can’t take the transfer: ${excluded[0]!.reasons.join('; ').toLowerCase()}.`,
      );
    }
    return entry.vehicle;
  }

  /** Crew must work for the provider, be active, and not already be on another confirmed trip. */
  private async assertCrew(assignment: DispatchAssignment, crewMemberIds: string[]): Promise<void> {
    const crew = await this.prisma.crewMember.findMany({
      where: {
        id: { in: crewMemberIds },
        institutionId: assignment.providerId!,
        recordStatus: 'ACTIVE',
      },
      include: {
        assignments: {
          where: { assignment: { status: 'CONFIRMED', id: { not: assignment.id } } },
          select: { assignmentId: true },
        },
      },
    });
    if (crew.length !== crewMemberIds.length)
      throw new BadRequestException('Choose active crew members from your own team.');
    const busy = crew.filter((c) => c.assignments.length > 0);
    if (busy.length) {
      throw new ConflictException(
        `${busy.map((c) => c.fullName).join(', ')} ${busy.length === 1 ? 'is' : 'are'} already on another transfer.`,
      );
    }
  }

  private async confirmAvailability(
    tx: Prisma.TransactionClient,
    vehicleId: string,
    userId: string,
    at: Date,
  ): Promise<void> {
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: { status: 'AVAILABLE', statusUpdatedAt: at, statusUpdatedById: userId },
    });
  }
}
