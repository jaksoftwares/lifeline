'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  ActionError,
  check,
  number,
  parseForm,
  requireMember,
  run,
  text,
  type FormState,
} from '@/lib/actions';
import { EQUIPMENT } from '@/lib/constants';
import { createAdminClient } from '@/lib/supabase/server';

const ambulanceSchema = z.object({
  plate: text('Number plate', 20).transform((p) => p.toUpperCase().replace(/\s+/g, ' ')),
  type: z.enum(['basic', 'advanced', 'critical_care'], { error: 'Choose the ambulance type' }),
  equipment: z.array(z.enum(EQUIPMENT)).default([]),
  fuel_use: number('Enter fuel use').pipe(
    z.number().min(1, 'Fuel use looks too low').max(60, 'Fuel use looks too high'),
  ),
});

export async function addAmbulance(_: FormState, formData: FormData): Promise<FormState> {
  return run(async () => {
    const { organization } = await requireMember({ type: 'ambulance_provider' });
    const input = parseForm(ambulanceSchema, formData);
    check(
      await createAdminClient()
        .from('ambulances')
        .insert({
          ...input,
          provider_id: organization.id,
          // Starts at the provider's base until the driver's phone reports a position.
          lat: organization.lat,
          lng: organization.lng,
        }),
      `Could not add ${input.plate}`,
    );
    revalidatePath('/fleet');
    return `${input.plate} added.`;
  });
}

/** Mark an ambulance available or offline. "On trip" is set by the transfer flow only. */
export async function setAmbulanceStatus(
  ambulanceId: string,
  status: 'available' | 'offline',
): Promise<FormState> {
  return run(async () => {
    const { organization } = await requireMember({ type: 'ambulance_provider' });
    const db = createAdminClient();
    const updated = check(
      await db
        .from('ambulances')
        .update({ status })
        .eq('id', ambulanceId)
        .eq('provider_id', organization.id)
        .neq('status', 'on_trip')
        .select('id'),
      'Could not update the ambulance',
    );
    if (!updated?.length) throw new ActionError('This ambulance is on a trip.');
    revalidatePath('/fleet');
  });
}

export async function removeAmbulance(ambulanceId: string): Promise<FormState> {
  return run(async () => {
    const { organization } = await requireMember({ type: 'ambulance_provider', admin: true });
    const result = await createAdminClient()
      .from('ambulances')
      .delete()
      .eq('id', ambulanceId)
      .eq('provider_id', organization.id);
    if (result.error?.code === '23503') {
      throw new ActionError('It has trip history. Set it offline instead.');
    }
    check(result, 'Could not remove the ambulance');
    revalidatePath('/fleet');
  });
}
