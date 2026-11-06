'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Transfer } from '@/lib/types';

interface Alert {
  id: string;
  text: string;
  href: string;
}

interface Viewer {
  orgId: string | null;
  userId: string;
  isDriver: boolean;
}

/** Short two-tone chime, generated so there is no audio file to load. */
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.4);
    });
  } catch {
    // Sound is a bonus; the on-screen alert is what matters.
  }
}

/** What, if anything, this person should be alerted about for a changed transfer. */
function alertFor(t: Transfer, { orgId, userId, isDriver }: Viewer): string | null {
  const fresh = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() < 60_000;
  const p = t.patient_name;

  if (isDriver) {
    return t.driver_id === userId && t.status === 'ambulance_assigned' && fresh(t.assigned_at)
      ? `New trip: collect ${p}`
      : null;
  }
  if (t.receiving_hospital_id === orgId) {
    if (t.status === 'requested') return `New transfer request: ${p}`;
    if (t.status === 'patient_onboard' && fresh(t.picked_up_at)) return `${p} is on the way to you`;
    if (t.status === 'arrived' && fresh(t.arrived_at)) return `${p} has arrived. Confirm handover.`;
  }
  if (t.sending_hospital_id === orgId) {
    if (!t.provider_id && fresh(t.responded_at)) {
      if (t.status === 'accepted') return `${p} was accepted. Request an ambulance.`;
      if (t.status === 'declined') return `${p} was declined. Choose another hospital.`;
    }
    if (t.status === 'ambulance_assigned' && fresh(t.assigned_at))
      return `Ambulance assigned for ${p}`;
    if (t.status === 'handed_over' && fresh(t.handed_over_at)) return `${p} was handed over safely`;
    if (t.status === 'en_route_to_pickup' && fresh(t.departed_at))
      return `Ambulance on the way to collect ${p}`;
  }
  if (t.provider_id === orgId && t.status === 'accepted' && fresh(t.ambulance_requested_at)) {
    return `Ambulance requested for ${p}`;
  }
  return null;
}

/**
 * Keeps every page live: when a transfer the user can see changes, the page refreshes, and
 * new requests or responses for this organization pop up with a chime.
 */
export function LiveUpdates({ orgId, userId, isDriver }: Viewer) {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const lastAlert = useRef(new Map<string, string>());

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    const channel = supabase
      .channel('transfers-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, (payload) => {
        refresh();
        const t = payload.new as Transfer;
        if (!t?.id) return;
        const text = alertFor(t, { orgId, userId, isDriver });
        // Alert once per transfer state.
        if (text && lastAlert.current.get(t.id) !== text) {
          lastAlert.current.set(t.id, text);
          setAlerts((a) =>
            [
              ...a,
              {
                id: `${t.id}-${Date.now()}`,
                text,
                href: isDriver ? '/trip' : `/transfers/${t.id}`,
              },
            ].slice(-3),
          );
          chime();
        }
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transfer_events' },
        refresh,
      )
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [orgId, userId, isDriver, router]);

  if (!alerts.length) return null;
  return (
    <div className="fixed right-4 top-4 z-50 w-[min(24rem,calc(100vw-2rem))] space-y-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          role="status"
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-white p-4 shadow-lg"
        >
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">{a.text}</p>
            <Link
              href={a.href}
              onClick={() => setAlerts((all) => all.filter((x) => x.id !== a.id))}
              className="font-semibold text-brand-700 hover:underline"
            >
              Open →
            </Link>
          </div>
          <button
            onClick={() => setAlerts((all) => all.filter((x) => x.id !== a.id))}
            aria-label="Dismiss"
            className="text-slate-400 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
