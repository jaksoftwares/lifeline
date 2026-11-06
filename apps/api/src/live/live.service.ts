import { Injectable, Logger } from '@nestjs/common';
import { type LiveEvent } from '@lifeline/schemas';
import { type TransferStatus } from '@prisma/client';
import { Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { type TransferScope } from '../transport/transfer-access';

export interface ScopedEvent {
  event: LiveEvent;
  /** Who may receive it, judged per connection with the transfer access rules. */
  scope: TransferScope;
}

/**
 * In-process event bus for live updates. One API instance serves the pilot; running several would
 * need a shared bus (Redis pub/sub) behind this same interface.
 */
@Injectable()
export class LiveService {
  private readonly logger = new Logger(LiveService.name);
  readonly events = new Subject<ScopedEvent>();

  constructor(private readonly prisma: PrismaService) {}

  /** Call after the change has been committed. Never throws: live updates are best effort. */
  async transferChanged(transferId: string): Promise<void> {
    await this.publish(transferId, (t) => ({
      type: 'transfer',
      transferId,
      status: t.status,
      at: new Date().toISOString(),
    }));
  }

  async assignmentChanged(assignmentId: string): Promise<void> {
    const a = await this.prisma.dispatchAssignment
      .findUnique({ where: { id: assignmentId }, select: { transferId: true } })
      .catch(() => null);
    if (a) await this.transferChanged(a.transferId);
  }

  /** A referral change (e.g. cancellation) that may have changed its transfer. */
  async referralChanged(referralId: string): Promise<void> {
    const t = await this.prisma.transfer
      .findFirst({ where: { referralId }, orderBy: { requestedAt: 'desc' }, select: { id: true } })
      .catch(() => null);
    if (t) await this.transferChanged(t.id);
  }

  async positionReceived(transferId: string): Promise<void> {
    await this.publish(transferId, () => ({
      type: 'position',
      transferId,
      at: new Date().toISOString(),
    }));
  }

  private async publish(
    transferId: string,
    build: (t: { status: TransferStatus }) => LiveEvent,
  ): Promise<void> {
    try {
      const transfer = await this.prisma.transfer.findUnique({
        where: { id: transferId },
        include: { assignments: { select: { id: true, providerId: true, status: true } } },
      });
      if (!transfer) return;
      this.events.next({ event: build(transfer), scope: transfer });
    } catch (error) {
      this.logger.warn(`Live update for ${transferId} not sent: ${(error as Error).message}`);
    }
  }
}
