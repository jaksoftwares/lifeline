'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { LocateFixed } from 'lucide-react';
import type { Point } from './map-picker';

const MapPicker = dynamic(() => import('./map-picker'), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-slate-100" />,
});

/** Pick a location by tapping the map or using the device GPS. Submits as `lat` and `lng`. */
export function LocationField({ defaultValue }: { defaultValue?: Point | null }) {
  const [point, setPoint] = useState<Point | null>(defaultValue ?? null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  function locate() {
    setError('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError('Could not get your location. Tap the map instead.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Location</span>
        <button
          type="button"
          onClick={locate}
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
        >
          <LocateFixed className="h-4 w-4" /> {locating ? 'Locating…' : 'Use my location'}
        </button>
      </div>
      <MapPicker value={point} onChange={setPoint} />
      <p className={`mt-1 text-xs ${error ? 'text-red-600' : 'text-slate-500'}`}>
        {error ||
          (point
            ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`
            : 'Tap the map to set the location.')}
      </p>
      <input type="hidden" name="lat" value={point?.lat ?? ''} />
      <input type="hidden" name="lng" value={point?.lng ?? ''} />
    </div>
  );
}
