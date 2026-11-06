'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { timeAgo } from '@/lib/format';

const TrackingMapView = dynamic(() => import('./tracking-map-view'), {
  ssr: false,
  loading: () => <div className="h-80 w-full animate-pulse bg-slate-100 sm:h-96" />,
});

interface Place {
  lat: number;
  lng: number;
  name: string;
}

export interface TrackingMapProps {
  pickup: Place | null;
  destination: Place | null;
  ambulanceId: string | null;
  ambulance: { lat: number | null; lng: number | null; last_seen_at: string | null } | null;
  routes: { path: [number, number][] }[];
}

/** Map of the trip with the ambulance moving live as the driver's phone reports its position. */
export function TrackingMap({ ambulanceId, ambulance, ...props }: TrackingMapProps) {
  const [position, setPosition] = useState(ambulance);

  useEffect(() => {
    if (!ambulanceId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`ambulance-${ambulanceId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ambulances', filter: `id=eq.${ambulanceId}` },
        (payload) => {
          const a = payload.new as {
            lat: number | null;
            lng: number | null;
            last_seen_at: string | null;
          };
          setPosition({ lat: a.lat, lng: a.lng, last_seen_at: a.last_seen_at });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ambulanceId]);

  const here =
    position?.lat != null && position.lng != null ? { lat: position.lat, lng: position.lng } : null;
  return (
    <div>
      <TrackingMapView {...props} ambulance={here} />
      {position?.last_seen_at && (
        <p className="px-4 py-2 text-xs text-slate-500">
          Ambulance position updated {timeAgo(position.last_seen_at)}
        </p>
      )}
    </div>
  );
}
