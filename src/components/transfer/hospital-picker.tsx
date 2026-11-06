'use client';

import { Phone } from 'lucide-react';
import { SERVICES } from '@/lib/constants';
import { timeAgo } from '@/lib/format';
import { formatKm } from '@/lib/geo';
import type { HospitalOption } from '@/lib/queries';
import type { Service } from '@/lib/types';

/**
 * Hospitals offering the needed service: those with free beds first, then nearest.
 * Submits the choice as `receiving_hospital_id`.
 */
export function HospitalPicker({
  hospitals,
  service,
}: {
  hospitals: HospitalOption[];
  service: Service | '';
}) {
  if (!service) {
    return <p className="text-sm text-slate-500">Choose a service to see hospitals.</p>;
  }
  const offering = hospitals
    .filter((h) => h.beds[service] !== undefined)
    .sort((a, b) => Number((b.beds[service] ?? 0) > 0) - Number((a.beds[service] ?? 0) > 0));

  if (!offering.length) {
    return (
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        No hospital on Afyaline lists {SERVICES[service]} yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {offering.map((h, i) => {
        const beds = h.beds[service] ?? 0;
        return (
          <li key={h.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 transition has-checked:border-brand-600 has-checked:bg-brand-50 hover:border-slate-300">
              <input
                type="radio"
                name="receiving_hospital_id"
                value={h.id}
                defaultChecked={i === 0 && beds > 0}
                required
                className="accent-brand-600"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{h.name}</span>
                <span className="block text-xs text-slate-500">
                  {h.county}
                  {h.level ? ` · Level ${h.level}` : ''} · {formatKm(h.distanceKm)} away
                  {h.updatedAt ? ` · beds updated ${timeAgo(h.updatedAt)}` : ''}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  beds > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {beds > 0 ? `${beds} bed${beds === 1 ? '' : 's'}` : 'No beds listed'}
              </span>
              <a
                href={`tel:${h.phone.replace(/\s/g, '')}`}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 rounded-full p-2 text-brand-700 hover:bg-brand-100"
                title={`Call ${h.phone}`}
              >
                <Phone className="h-4 w-4" />
              </a>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
