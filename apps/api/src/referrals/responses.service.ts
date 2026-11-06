import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  canRespondToRequest,
  DECLINE_REASON_LABELS,
  OPEN_REQUEST_STATUSES,
} from '@lifeline/domain';
import { type RespondToRequestInput } from '@lifeline/schemas';
import { type Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, NOT_PERMITTED } from '../auth/auth-context';
import { type RequestMeta } from '../common/request-meta';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertCanView } from './referral-access';
import { recordReferralEvent } from './referral-records';
import { ReferralsService } from './referrals.service';

const ALREADY_PLACED =
  'Another facility has already accepted this referral, or it is no longer open.';

@Injectable()
export class ResponsesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly referrals: ReferralsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * A receiving facility's answer. Acceptance is first-come: it claims the referral atomically and
   * withdraws every other open request, so two facilities can never both hold the same patient.
   */
  async respond(
    auth: AuthContext,
    requestId: string,
    input: RespondToRequestInput,
    meta: RequestMeta,
  ): Promise<void> {
    const request = await this.prisma.referralRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Request not found.');
    const { referral, access } = await this.referrals.load(auth, request.referralId);
    assertCanView(access);
    if (!access.respondableRequestIds.includes(requestId))
      throw new ForbiddenException(NOT_PERMITTED);
    if (!canRespondToRequest(referral.status, request.status))
      throw new ConflictException(ALREADY_PLACED);

    const now = new Date();
    const base = {
      referralId: referral.id,
      actorId: auth.userId,
      institutionId: request.institutionId,
      requestId,
      at: now,
    };

    await this.prisma.$transaction(async (tx) => {
      if (input.decision === 'ACCEPT') {
        if (input.receivingDepartmentId) {
          const dept = await tx.department.findUnique({
            where: { id: input.receivingDepartmentId },
          });
          if (dept?.institutionId !== request.institutionId)
            throw new BadRequestException('Choose one of your departments.');
        }
        const claimed = await tx.referral.updateMany({
          where: { id: referral.id, status: 'SUBMITTED' },
          data: { status: 'ACCEPTED', acceptedAt: now, acceptedRequestId: requestId },
        });
        if (claimed.count === 0) throw new ConflictException(ALREADY_PLACED);
        await this.claimOpenRequest(tx, requestId, {
          status: 'ACCEPTED',
          respondedAt: now,
          respondedById: auth.userId,
          responseNote: input.note ?? null,
          receivingDepartmentId: input.receivingDepartmentId ?? null,
          readyAt: input.readyAt ? new Date(input.readyAt) : null,
        });
        await recordReferralEvent(tx, { ...base, type: 'ACCEPTED', note: input.note ?? null });

        const others = await tx.referralRequest.findMany({
          where: {
            referralId: referral.id,
            id: { not: requestId },
            status: { in: [...OPEN_REQUEST_STATUSES] },
          },
        });
        for (const other of others) {
          await tx.referralRequest.update({
            where: { id: other.id },
            data: {
              status: 'WITHDRAWN',
              withdrawnAt: now,
              withdrawReason: 'Accepted by another facility',
            },
          });
          await recordReferralEvent(tx, {
            referralId: referral.id,
            type: 'WITHDRAWN',
            actorId: null,
            institutionId: other.institutionId,
            requestId: other.id,
            note: 'Accepted by another facility',
            at: now,
          });
        }
      } else if (input.decision === 'DECLINE') {
        await this.claimOpenRequest(tx, requestId, {
          status: 'DECLINED',
          respondedAt: now,
          respondedById: auth.userId,
          declineReason: input.declineReason,
          responseNote: input.note ?? null,
        });
        await recordReferralEvent(tx, {
          ...base,
          type: 'DECLINED',
          note: [DECLINE_REASON_LABELS[input.declineReason], input.note].filter(Boolean).join(': '),
          metadata: { declineReason: input.declineReason },
        });
      } else {
        await this.claimOpenRequest(tx, requestId, { status: 'INFO_REQUESTED' });
        await tx.referralMessage.create({
          data: {
            requestId,
            kind: 'INFO_REQUEST',
            body: input.question,
            authorId: auth.userId,
            authorInstitutionId: request.institutionId,
            createdAt: now,
          },
        });
        await recordReferralEvent(tx, { ...base, type: 'INFO_REQUESTED', note: input.question });
      }

      await this.audit.record(
        {
          action: `referral.request_${input.decision.toLowerCase()}`,
          entityType: 'referral_request',
          entityId: requestId,
          actorId: auth.userId,
          networkId: referral.networkId,
          institutionId: request.institutionId,
          metadata: { reference: referral.reference },
          meta,
        },
        tx,
      );
      const notice = {
        ACCEPT: {
          eventType: 'REFERRAL_ACCEPTED',
          title: 'Referral accepted',
          message: `A receiving facility accepted referral ${referral.reference}.`,
        },
        DECLINE: {
          eventType: 'REFERRAL_DECLINED',
          title: 'Referral declined',
          message: `A receiving facility declined referral ${referral.reference}.`,
        },
        REQUEST_INFO: {
          eventType: 'REFERRAL_INFO_REQUESTED',
          title: 'More information requested',
          message: `A receiving facility requested more information for referral ${referral.reference}.`,
        },
      }[input.decision];
      await this.notifications.notifyRoles(tx, {
        networkId: referral.networkId,
        institutionId: referral.referringInstitutionId,
        roles: ['REFERRING_CLINICIAN', 'REFERRAL_COORDINATOR'],
        eventType: notice.eventType,
        eventKey: `referral-response:${requestId}:${now.toISOString()}`,
        title: notice.title,
        message: notice.message,
        entityType: 'referral',
        entityId: referral.id,
      });
    });
  }

  /**
   * Adds to the conversation between the referring facility and one receiving facility. A referrer's
   * reply to an information request puts the request back in the receiving facility's queue.
   */
  async postMessage(
    auth: AuthContext,
    requestId: string,
    body: string,
    meta: RequestMeta,
  ): Promise<void> {
    const request = await this.prisma.referralRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Request not found.');
    const { referral, access } = await this.referrals.load(auth, request.referralId);
    assertCanView(access);

    const asReferrer = access.isReferrer;
    const asReceiver = access.receivingRequestIds.includes(requestId);
    if (!asReferrer && !asReceiver) throw new ForbiddenException(NOT_PERMITTED);
    if (
      referral.status === 'CANCELLED' ||
      request.status === 'DECLINED' ||
      request.status === 'WITHDRAWN'
    ) {
      throw new ConflictException('This conversation is closed.');
    }

    const answersQuestion = asReferrer && request.status === 'INFO_REQUESTED';
    const now = new Date();
    const escalationReset = answersQuestion
      ? {
          escalationDueAt: new Date(
            now.getTime() +
              (
                await this.prisma.network.findUniqueOrThrow({
                  where: { id: referral.networkId },
                  select: { referralEscalationMinutes: true },
                })
              ).referralEscalationMinutes *
                60_000,
          ),
          escalatedAt: null,
        }
      : undefined;
    await this.prisma.$transaction(async (tx) => {
      await tx.referralMessage.create({
        data: {
          requestId,
          kind: answersQuestion ? 'INFO_RESPONSE' : 'NOTE',
          body,
          authorId: auth.userId,
          authorInstitutionId: asReferrer ? referral.referringInstitutionId : request.institutionId,
          createdAt: now,
        },
      });
      if (answersQuestion && escalationReset) {
        const { count } = await tx.referralRequest.updateMany({
          where: { id: requestId, status: 'INFO_REQUESTED' },
          data: { status: 'PENDING', ...escalationReset },
        });
        if (count === 0)
          throw new ConflictException('This information request has already been answered.');
        await recordReferralEvent(tx, {
          referralId: referral.id,
          type: 'INFO_PROVIDED',
          actorId: auth.userId,
          institutionId: referral.referringInstitutionId,
          requestId,
        });
      } else {
        await tx.referral.update({ where: { id: referral.id }, data: { updatedAt: new Date() } });
      }
      await this.audit.record(
        {
          action: 'referral.message_sent',
          entityType: 'referral_request',
          entityId: requestId,
          actorId: auth.userId,
          networkId: referral.networkId,
          institutionId: asReferrer ? referral.referringInstitutionId : request.institutionId,
          metadata: { reference: referral.reference },
          meta,
        },
        tx,
      );
      if (answersQuestion) {
        await this.notifications.notifyRoles(tx, {
          networkId: referral.networkId,
          institutionId: request.institutionId,
          roles: ['RECEIVING_DECISION_MAKER', 'REFERRAL_COORDINATOR'],
          eventType: 'REFERRAL_INFO_PROVIDED',
          eventKey: `referral-info-provided:${requestId}:${now.toISOString()}`,
          title: 'Referral information received',
          message: `The referring facility replied to your question for referral ${referral.reference}.`,
          entityType: 'referral',
          entityId: referral.id,
        });
      }
    });
  }

  /** Updates a request only if it is still open, so concurrent answers can't overwrite each other. */
  private async claimOpenRequest(
    tx: Prisma.TransactionClient,
    requestId: string,
    data: Prisma.ReferralRequestUncheckedUpdateManyInput,
  ): Promise<void> {
    const { count } = await tx.referralRequest.updateMany({
      where: { id: requestId, status: { in: [...OPEN_REQUEST_STATUSES] } },
      data,
    });
    if (count === 0) throw new ConflictException(ALREADY_PLACED);
  }
}
