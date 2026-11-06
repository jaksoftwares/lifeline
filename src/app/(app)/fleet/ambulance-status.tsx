'use client';

import { useState, useTransition } from 'react';
import type { AmbulanceStatus } from '@/lib/types';
import { setAmbulanceStatus } from './actions';

/** One-tap switch between available and offline. */
export function AmbulanceStatusToggle({ id, status }: { id: string; status: AmbulanceStatus }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  if (status === 'on_trip') {
    return (
      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
        On trip
      </span>
    );
  }
  const available = status === 'available';
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () =>
            setError(
              (await setAmbulanceStatus(id, available ? 'offline' : 'available')).error ?? '',
            ),
          )
        }
        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${
          available
            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        }`}
        title={available ? 'Tap to set offline' : 'Tap to set available'}
      >
        {available ? 'Available' : 'Offline'}
      </button>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </span>
  );
}
