import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { assertPermission, type AuthContext, NOT_PERMITTED } from '../auth/auth-context';
import { AuditService } from '../audit/audit.service';
import { type RequestMeta } from '../common/request-meta';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { type NotificationSettings, type NotificationView } from '@lifeline/schemas';
import { type Prisma, type Role } from '@prisma/client';
import { createRoleNotifications, type NotifyRolesInput } from './notification-records';
import { PostmarkEmailService, PostmarkSendError } from './postmark-email.service';

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private escalationTimer: NodeJS.Timeout | undefined;
  private emailTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly postmark: PostmarkEmailService,
  ) {}

  onModuleInit(): void {
    if (this.config.isTest) return;
    this.escalationTimer = setInterval(() => {
      void this.processDueEscalations().catch((error: unknown) => {
        this.logger.error('Could not process due referral escalations.', error);
      });
    }, 15_000);
    this.escalationTimer.unref();
    this.emailTimer = setInterval(() => {
      void this.processPendingEmailDeliveries().catch((error: unknown) => {
        this.logger.error('Could not process pending Postmark email deliveries.', error);
      });
    }, 15_000);
    this.emailTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.escalationTimer) clearInterval(this.escalationTimer);
    if (this.emailTimer) clearInterval(this.emailTimer);
  }

  async notifyRoles(tx: Prisma.TransactionClient, input: NotifyRolesInput): Promise<void> {
    await createRoleNotifications(tx, input, this.postmark.isConfigured);
  }

  async processPendingEmailDeliveries(now = new Date()): Promise<number> {
    await this.prisma.notificationDelivery.updateMany({
      where: {
        channel: 'EMAIL',
        status: 'SENDING',
        attemptedAt: { lt: new Date(now.getTime() - 5 * 60_000) },
      },
      data: {
        status: 'FAILED',
        error: 'Delivery outcome is unknown; check Postmark before retrying.',
      },
    });

    if (!this.postmark.isConfigured) {
      await this.prisma.notificationDelivery.updateMany({
        where: { channel: 'EMAIL', status: 'PENDING' },
        data: { status: 'UNCONFIGURED', error: 'Postmark is not configured.' },
      });
      return 0;
    }

    const pending = await this.prisma.notificationDelivery.findMany({
      where: { channel: 'EMAIL', status: 'PENDING' },
      include: {
        notification: {
          include: { user: { select: { email: true } } },
        },
      },
      orderBy: { id: 'asc' },
      take: 100,
    });
    let processed = 0;

    for (const delivery of pending) {
      const claimed = await this.prisma.notificationDelivery.updateMany({
        where: { id: delivery.id, status: 'PENDING' },
        data: { status: 'SENDING', attemptedAt: now, error: null },
      });
      if (claimed.count === 0) continue;

      const membership = await this.prisma.membership.findFirst({
        where: {
          userId: delivery.notification.userId,
          networkId: delivery.notification.networkId,
          institutionId: delivery.notification.institutionId,
          role: delivery.notification.recipientRole,
          user: { status: 'ACTIVE' },
        },
        select: { id: true },
      });
      if (!membership) {
        await this.prisma.notificationDelivery.updateMany({
          where: { id: delivery.id, status: 'SENDING' },
          data: { status: 'SKIPPED', error: 'Recipient access is no longer active.' },
        });
        processed++;
        continue;
      }

      try {
        await this.postmark.send({
          to: delivery.notification.user.email,
          subject: `Lifeline: ${delivery.notification.title}`,
          textBody: [
            delivery.notification.title,
            delivery.notification.message,
            '',
            `Open Lifeline notifications: ${new URL('/notifications', this.config.env.WEB_ORIGIN).toString()}`,
          ].join('\n'),
        });
      } catch (error) {
        const message =
          error instanceof PostmarkSendError
            ? error.message
            : 'Could not reach Postmark; delivery was not confirmed.';
        await this.prisma.notificationDelivery.updateMany({
          where: { id: delivery.id, status: 'SENDING' },
          data: { status: 'FAILED', error: message },
        });
        this.logger.warn(`Postmark delivery failed for notification ${delivery.id}: ${message}`);
        processed++;
        continue;
      }

      await this.prisma.notificationDelivery.updateMany({
        where: { id: delivery.id, status: 'SENDING' },
        data: { status: 'SENT', error: null },
      });
      processed++;
    }

    return processed;
  }

  async list(
    auth: AuthContext,
    input: { networkId: string; unreadOnly: boolean },
  ): Promise<NotificationView[]> {
    const scopes = this.scopesFor(auth, input.networkId);
    if (scopes.length === 0) throw new ForbiddenException(NOT_PERMITTED);
    const notifications = await this.prisma.notification.findMany({
      where: {
        userId: auth.userId,
        networkId: input.networkId,
        ...(input.unreadOnly ? { readAt: null } : {}),
        OR: scopes.map(({ institutionId, role }) => ({
          institutionId,
          recipientRole: role,
        })),
      },
      include: { deliveries: { orderBy: { channel: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return notifications.map((notification) => ({
      id: notification.id,
      eventType: notification.eventType,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType,
      entityId: notification.entityId,
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt?.toISOString() ?? null,
      deliveries: notification.deliveries.map((delivery) => ({
        channel: delivery.channel,
        status: delivery.status,
        error: delivery.error,
      })),
    }));
  }

  async markRead(auth: AuthContext, id: string): Promise<void> {
    const notification = await this.visibleNotification(auth, id);
    await this.prisma.notification.updateMany({
      where: { id: notification.id, userId: auth.userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(auth: AuthContext, networkId: string): Promise<void> {
    const scopes = this.scopesFor(auth, networkId);
    if (scopes.length === 0) throw new ForbiddenException(NOT_PERMITTED);
    await this.prisma.notification.updateMany({
      where: {
        userId: auth.userId,
        networkId,
        readAt: null,
        OR: scopes.map(({ institutionId, role }) => ({ institutionId, recipientRole: role })),
      },
      data: { readAt: new Date() },
    });
  }

  async settings(auth: AuthContext, networkId: string): Promise<NotificationSettings> {
    assertPermission(auth, 'network:configure', { networkId });
    const network = await this.prisma.network.findUnique({
      where: { id: networkId },
      select: { id: true, referralEscalationMinutes: true },
    });
    if (!network) throw new NotFoundException('Network not found.');
    return { networkId: network.id, referralEscalationMinutes: network.referralEscalationMinutes };
  }

  async updateSettings(
    auth: AuthContext,
    input: NotificationSettings,
    meta: RequestMeta,
  ): Promise<NotificationSettings> {
    assertPermission(auth, 'network:configure', { networkId: input.networkId });
    const network = await this.prisma.network.findUnique({
      where: { id: input.networkId },
      select: { id: true, referralEscalationMinutes: true },
    });
    if (!network) throw new NotFoundException('Network not found.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.network.update({
        where: { id: input.networkId },
        data: { referralEscalationMinutes: input.referralEscalationMinutes },
        select: { id: true, referralEscalationMinutes: true },
      });
      await this.audit.record(
        {
          action: 'notifications.escalation_settings_updated',
          entityType: 'network',
          entityId: saved.id,
          actorId: auth.userId,
          networkId: saved.id,
          metadata: {
            previousMinutes: network.referralEscalationMinutes,
            referralEscalationMinutes: saved.referralEscalationMinutes,
          },
          meta,
        },
        tx,
      );
      return saved;
    });
    return {
      networkId: updated.id,
      referralEscalationMinutes: updated.referralEscalationMinutes,
    };
  }

  async processDueEscalations(now = new Date()): Promise<number> {
    const dueRequests = await this.prisma.referralRequest.findMany({
      where: {
        status: 'PENDING',
        escalationDueAt: { lte: now },
        escalatedAt: null,
        referral: { status: 'SUBMITTED' },
      },
      include: { referral: { select: { networkId: true, reference: true } } },
      orderBy: { escalationDueAt: 'asc' },
      take: 100,
    });
    let escalated = 0;
    for (const request of dueRequests) {
      const escalationDueAt = request.escalationDueAt;
      if (!escalationDueAt) continue;
      const claimed = await this.prisma.$transaction(async (tx) => {
        const result = await tx.referralRequest.updateMany({
          where: {
            id: request.id,
            status: 'PENDING',
            escalationDueAt: { lte: now },
            escalatedAt: null,
            referral: { status: 'SUBMITTED' },
          },
          data: { escalatedAt: now },
        });
        if (result.count === 0) return false;
        await this.notifyRoles(tx, {
          networkId: request.referral.networkId,
          institutionId: null,
          roles: ['NETWORK_OPERATIONS'],
          eventType: 'REFERRAL_ESCALATED',
          eventKey: `referral-escalation:${request.id}:${escalationDueAt.toISOString()}`,
          title: 'Referral response overdue',
          message: `No response has been recorded for referral ${request.referral.reference}.`,
          entityType: 'referral',
          entityId: request.referralId,
        });
        return true;
      });
      if (claimed) escalated++;
    }
    return escalated;
  }

  private async visibleNotification(auth: AuthContext, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id,
        userId: auth.userId,
        OR: this.scopesFor(auth, undefined).map(({ networkId, institutionId, role }) => ({
          networkId,
          institutionId,
          recipientRole: role,
        })),
      },
    });
    if (!notification) throw new NotFoundException('Notification not found.');
    return notification;
  }

  private scopesFor(
    auth: AuthContext,
    networkId: string | undefined,
  ): { networkId: string; institutionId: string | null; role: Role }[] {
    return auth.grants
      .filter((grant) => networkId === undefined || grant.networkId === networkId)
      .map((grant) => ({
        networkId: grant.networkId,
        institutionId: grant.institutionId,
        role: grant.role,
      }));
  }
}
