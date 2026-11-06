import 'server-only';
import { distanceKm } from './geo';
import { createClient } from './supabase/server';
import type { HospitalCapacity, Organization, Service } from './types';

export interface HospitalOption {
  id: string;
  name: string;
  county: string;
  level: number | null;
  phone: string;
  distanceKm: number | null;
  beds: Partial<Record<Service, number>>;
  updatedAt: string | null;
}

/** Every other hospital with its beds, nearest first, for choosing where to send a patient. */
export async function getHospitalOptions(from: Organization): Promise<HospitalOption[]> {
  const supabase = await createClient();
  const [{ data: hospitals }, { data: capacity }] = await Promise.all([
    supabase.from('organizations').select('*').eq('type', 'hospital').neq('id', from.id),
    supabase.from('hospital_capacity').select('*'),
  ]);
  return ((hospitals as Organization[]) ?? [])
    .map((h) => {
      const rows = ((capacity as HospitalCapacity[]) ?? []).filter((c) => c.hospital_id === h.id);
      return {
        id: h.id,
        name: h.name,
        county: h.county,
        level: h.level,
        phone: h.phone,
        distanceKm: distanceKm(from, h),
        beds: Object.fromEntries(rows.map((r) => [r.service, r.beds_available])),
        updatedAt:
          rows
            .map((r) => r.updated_at)
            .sort()
            .at(-1) ?? null,
      };
    })
    .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
}
