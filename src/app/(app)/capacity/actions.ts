'use server';

import { revalidatePath } from 'next/cache';
import { ActionError, check, requireMember, run, type FormState } from '@/lib/actions';
import { SERVICES } from '@/lib/constants';
import { createAdminClient } from '@/lib/supabase/server';
import type { Service } from '@/lib/types';

/** Saves beds available per service. An empty box means the service is not offered. */
export async function saveCapacity(_: FormState, formData: FormData): Promise<FormState> {
  return run(async () => {
    const { organization } = await requireMember({ type: 'hospital' });
    const offered: { service: Service; beds_available: number }[] = [];
    const notOffered: Service[] = [];

    for (const service of Object.keys(SERVICES) as Service[]) {
      const raw = String(formData.get(service) ?? '').trim();
      if (raw === '') {
        notOffered.push(service);
        continue;
      }
      const beds = Number(raw);
      if (!Number.isInteger(beds) || beds < 0 || beds > 9999) {
        throw new ActionError(`${SERVICES[service]}: enter a whole number of beds.`);
      }
      offered.push({ service, beds_available: beds });
    }

    const db = createAdminClient();
    const now = new Date().toISOString();
    if (offered.length) {
      check(
        await db
          .from('hospital_capacity')
          .upsert(offered.map((o) => ({ ...o, hospital_id: organization.id, updated_at: now }))),
        'Could not save beds',
      );
    }
    if (notOffered.length) {
      check(
        await db
          .from('hospital_capacity')
          .delete()
          .eq('hospital_id', organization.id)
          .in('service', notOffered),
        'Could not save beds',
      );
    }
    revalidatePath('/capacity');
    return 'Beds updated.';
  });
}
