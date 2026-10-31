import { type Prisma, type ReferralEventType } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export interface EventInput {
  referralId: string;
  type: ReferralEventType;
  actorId: string | null;
  institutionId?: string | null;
  requestId?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
  at?: Date;
}

/** Appends to the referral's history and marks the referral as recently changed (for inbox ordering). */
export async function recordReferralEvent(tx: Tx, input: EventInput): Promise<void> {
  const at = input.at ?? new Date();
  await tx.referralEvent.create({
    data: {
      referralId: input.referralId,
      type: input.type,
      actorId: input.actorId,
      institutionId: input.institutionId ?? null,
      requestId: input.requestId ?? null,
      note: input.note ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonObject,
      occurredAt: at,
    },
  });
  await tx.referral.update({ where: { id: input.referralId }, data: { updatedAt: at } });
}

/** Next human-readable reference for the network, e.g. DEMO-26-00042. Must run inside a transaction. */
export async function nextReferralReference(
  tx: Tx,
  networkId: string,
  now = new Date(),
): Promise<string> {
  const network = await tx.network.update({
    where: { id: networkId },
    data: { referralSequence: { increment: 1 } },
  });
  const year = String(now.getUTCFullYear()).slice(-2);
  return `${network.code}-${year}-${String(network.referralSequence).padStart(5, '0')}`;
}
