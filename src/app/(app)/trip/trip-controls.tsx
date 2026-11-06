'use client';

import { useEffect, useState, useTransition } from 'react';
import { MapPin, Navigation, Radio } from 'lucide-react';
import { Alert, Button } from '@/components/ui';
import { TRIP_STEPS } from '@/lib/trip';
import type { TransferStatus } from '@/lib/types';
import { advanceTrip, reportLocation } from './actions';

const REPORT_EVERY_MS = 15_000;

/**
 * Shares the phone's location while the trip is active and keeps the screen awake.
 * Sends at most one position every 15 seconds.
 */
function useLocationSharing() {
  const [state, setState] = useState<'starting' | 'on' | 'denied' | 'unsupported'>(() =>
    typeof navigator !== 'undefined' && !('geolocation' in navigator) ? 'unsupported' : 'starting',
  );

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    let lastSent = 0;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setState('on');
        if (Date.now() - lastSent < REPORT_EVERY_MS) return;
        lastSent = Date.now();
        reportLocation(pos.coords.latitude, pos.coords.longitude).catch(() => {
          lastSent = 0; // retry on the next fix
        });
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'starting'),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );

    // Keep the screen on so the browser keeps sending positions.
    let lock: { release: () => Promise<void> } | null = null;
    const wakeLock = (
      navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<typeof lock> } }
    ).wakeLock;
    const keepAwake = () =>
      wakeLock
        ?.request('screen')
        .then((l) => (lock = l))
        .catch(() => {});
    keepAwake();
    const onVisible = () => document.visibilityState === 'visible' && keepAwake();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      navigator.geolocation.clearWatch(watch);
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  return state;
}

export function TripControls({
  transferId,
  status,
  target,
}: {
  transferId: string;
  status: TransferStatus;
  target: { name: string; lat: number | null; lng: number | null };
}) {
  const sharing = useLocationSharing();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const step = TRIP_STEPS[status];

  // Opens Google Maps (app or web) with turn-by-turn directions. No API key needed.
  const navigateUrl =
    target.lat != null && target.lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=driving`
      : null;

  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      {step ? (
        <Button
          className="w-full py-5 text-lg"
          disabled={pending}
          onClick={() => {
            setError('');
            startTransition(async () =>
              setError((await advanceTrip(transferId, status)).error ?? ''),
            );
          }}
        >
          {pending ? 'Saving…' : step.label}
        </Button>
      ) : (
        <div className="rounded-lg bg-brand-50 p-4 text-center font-semibold text-brand-800">
          Arrived. Waiting for the hospital to confirm handover.
        </div>
      )}
      {navigateUrl && status !== 'arrived' && (
        <a
          href={navigateUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-4 text-base font-semibold text-white hover:bg-slate-800"
        >
          <Navigation className="h-5 w-5 shrink-0" />
          Navigate
        </a>
      )}
      <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
        {sharing === 'on' ? (
          <>
            <Radio className="h-3.5 w-3.5 text-emerald-600" /> Sharing location
          </>
        ) : sharing === 'denied' ? (
          <span className="text-red-600">
            <MapPin className="mr-1 inline h-3.5 w-3.5" />
            Location blocked. Allow it in your browser settings.
          </span>
        ) : sharing === 'unsupported' ? (
          'This device cannot share location.'
        ) : (
          'Finding your location…'
        )}
      </p>
    </div>
  );
}
