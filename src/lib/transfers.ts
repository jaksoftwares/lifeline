import 'server-only';
import { after } from 'next/server';
import { ActionError, type Member } from './actions';
import { notifyTransferEvent } from './notify';
import { createAdminClient } from './supabase/server';
import type { Transfer, TransferEventType, TransferStatus } from './types';

export async function getTransfer(id: string): Promise<Transfer> {
  const { data } = await createAdminClient()
    .from('transfers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!data) throw new ActionError('Transfer not found.');
  return data as Transfer;
}

/**
 * The one place a transfer changes. The update only applies if the transfer is still in one of
 * the `from` statuses (and matches `where`), so two people acting at once cannot both succeed.
 * Every change is written to the timeline.
 */
export async function changeTransfer({
  transfer,
  from,
  where = {},
  patch,
  event,
  note = null,
  actor,
}: {
  transfer: Transfer;
  from: TransferStatus[];
  where?: Record<string, string | null>;
  patch: Partial<Transfer>;
  event: TransferEventType;
  note?: string | null;
  actor: Member;
}) {
  const db = createAdminClient();
  let query = db.from('transfers').update(patch).eq('id', transfer.id).in('status', from);
  for (const [column, value] of Object.entries(where)) {
    query = value === null ? query.is(column, null) : query.eq(column, value);
  }
  const { data, error } = await query.select('id');
  if (error) {
    console.error('transfer update failed', error);
    throw new ActionError('Could not update the transfer. Please try again.');
  }
  if (!data.length) {
    throw new ActionError('This transfer has already moved on. Check the latest status above.');
  }

  await logEvent(transfer.id, event, actor, note);
}

export async function logEvent(
  transferId: string,
  event: TransferEventType,
  actor: Member,
  note: string | null = null,
) {
  const { error } = await createAdminClient().from('transfer_events').insert({
    transfer_id: transferId,
    status: event,
    note,
    actor_id: actor.profile.id,
    actor_name: actor.profile.full_name,
    organization_id: actor.organization.id,
  });
  if (error) console.error('timeline event not saved', error);
  // Email the people concerned once the response has been sent, so nobody waits on email.
  after(() => notifyTransferEvent(transferId, event, note));
}

/** Put an ambulance back in service (after cancelling, or later after handover). */
export async function releaseAmbulance(ambulanceId: string | null) {
  if (!ambulanceId) return;
  await createAdminClient()
    .from('ambulances')
    .update({ status: 'available' })
    .eq('id', ambulanceId)
    .eq('status', 'on_trip');
}
