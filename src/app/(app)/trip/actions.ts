'use server';

import { revalidatePath } from 'next/cache';
import { ActionError, requireDriver, run, type FormState } from '@/lib/actions';
import { createAdminClient } from '@/lib/supabase/server';
import { TRIP_STATUSES, TRIP_STEPS } from '@/lib/trip';
import { changeTransfer, getTransfer } from '@/lib/transfers';
import type { TransferStatus } from '@/lib/types';

/** The driver moves the trip one step forward (start → onboard → arrived). */
export async function advanceTrip(transferId: string, from: TransferStatus): Promise<FormState> {
  return run(async () => {
    const actor = await requireDriver();
    const transfer = await getTransfer(transferId);
    if (transfer.driver_id !== actor.profile.id) throw new ActionError('This is not your trip.');
    const step = TRIP_STEPS[from];
    if (!step || transfer.status !== from) throw new ActionError('The trip has already moved on.');

    await changeTransfer({
      transfer,
      actor,
      from: [from],
      patch: { status: step.next, [step.stamp]: new Date().toISOString() },
      event: step.next,
    });
    revalidatePath('/trip');
  });
}

/** The driver's phone reports where the ambulance is, while a trip is active. */
export async function reportLocation(lat: number, lng: number): Promise<void> {
  const valid =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  // 0,0 is a classic GPS glitch ("null island"), never a real ambulance position here.
  if (!valid || (lat === 0 && lng === 0)) return;
  const actor = await requireDriver();
  const db = createAdminClient();
  const { data: trip } = await db
    .from('transfers')
    .select('ambulance_id')
    .eq('driver_id', actor.profile.id)
    .in('status', TRIP_STATUSES)
    .limit(1)
    .maybeSingle();
  if (!trip?.ambulance_id) return;
  await db
    .from('ambulances')
    .update({ lat, lng, last_seen_at: new Date().toISOString() })
    .eq('id', trip.ambulance_id);
}
