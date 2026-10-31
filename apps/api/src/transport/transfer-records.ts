import { ConflictException } from '@nestjs/common';
import { OPEN_ASSIGNMENT_STATUSES, PRE_COLLECTION_STATUSES } from '@lifeline/domain';
import { Prisma, type TransferEventType } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export interface TransferEventInput {
  transferId: string;
  type: TransferEventType;
  actorId: string | null;
  institutionId?: string | null;
  assignmentId?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
  at?: Date;
}

/** Appends to the transfer's history and marks the transfer as recently changed (for list ordering). */
export async function recordTransferEvent(tx: Tx, input: TransferEventInput): Promise<void> {
  const at = input.at ?? new Date();
  await tx.transferEvent.create({
    data: {
      transferId: input.transferId,
      type: input.type,
      actorId: input.actorId,
      institutionId: input.institutionId ?? null,
      assignmentId: input.assignmentId ?? null,
      note: input.note ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonObject,
      occurredAt: at,
    },
  });
  await tx.transfer.update({ where: { id: input.transferId }, data: { updatedAt: at } });
}

/**
 * Cancels a referral's open transfer, if it has one, and ends any open offer or trip. Refused once the
 * patient has been collected: by then the ambulance must finish or report an interruption.
 */
export async function cancelOpenTransfer(
  tx: Tx,
  input: { referralId: string; actorId: string; institutionId: string; reason: string; at: Date },
): Promise<string | null> {
  const transfer = await tx.transfer.findFirst({
    where: { referralId: input.referralId, status: { not: 'CANCELLED' } },
  });
  if (!transfer) return null;
  return cancelTransfer(tx, transfer.id, input);
}

export async function cancelTransfer(
  tx: Tx,
  transferId: string,
  input: { actorId: string; institutionId: string; reason: string; at: Date },
): Promise<string> {
  const { count } = await tx.transfer.updateMany({
    where: { id: transferId, status: { in: [...PRE_COLLECTION_STATUSES] } },
    data: { status: 'CANCELLED', cancelledAt: input.at, cancelReason: input.reason },
  });
  if (count === 0) {
    throw new ConflictException(
      'This transfer can no longer be cancelled: the patient has been collected or it has already ended.',
    );
  }
  await tx.dispatchAssignment.updateMany({
    where: { transferId, status: { in: [...OPEN_ASSIGNMENT_STATUSES] } },
    data: { status: 'WITHDRAWN', endedAt: input.at, endReason: 'Transfer cancelled' },
  });
  await recordTransferEvent(tx, {
    transferId,
    type: 'CANCELLED',
    actorId: input.actorId,
    institutionId: input.institutionId,
    note: input.reason,
    at: input.at,
  });
  return transferId;
}

/** True for a unique-index violation, e.g. a second open offer or a vehicle confirmed twice. */
export function isUniqueViolation(error: unknown, index?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
    return false;
  if (!index) return true;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return JSON.stringify(target ?? '').includes(index) || error.message.includes(index);
}
