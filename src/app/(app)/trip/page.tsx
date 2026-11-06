import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Ambulance, Phone } from 'lucide-react';
import { TrackingMap } from '@/components/tracking-map';
import { CostsForm } from '@/components/transfer/costs-form';
import { Badge, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { SERVICES, STATUS, URGENCY, URGENCY_TONE } from '@/lib/constants';
import { formatKm } from '@/lib/geo';
import { getRoutes, located } from '@/lib/routing';
import { createClient } from '@/lib/supabase/server';
import { headingToPickup, TRIP_STATUSES } from '@/lib/trip';
import type { Ambulance as AmbulanceRow, Organization, Transfer } from '@/lib/types';
import { TripControls } from './trip-controls';

export const metadata: Metadata = { title: 'My trip' };

type Trip = Transfer & {
  sending: Organization;
  receiving: Organization;
  ambulance: AmbulanceRow | null;
};

/** The driver's screen: one trip, one big button, the route and the phone numbers. */
export default async function TripPage() {
  const { profile } = await requireUser();
  if (profile.role !== 'driver') redirect('/dashboard');

  const supabase = await createClient();
  const { data } = await supabase
    .from('transfers')
    .select(
      `*,
      sending:organizations!transfers_sending_hospital_id_fkey(*),
      receiving:organizations!transfers_receiving_hospital_id_fkey(*),
      ambulance:ambulances(*)`,
    )
    .eq('driver_id', profile.id)
    .in('status', TRIP_STATUSES)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const trip = data as Trip | null;

  if (!trip) {
    return (
      <Card className="mx-auto mt-10 max-w-md p-10 text-center">
        <Ambulance className="mx-auto h-12 w-12 text-brand-600" />
        <h1 className="mt-4 text-xl font-bold">No active trip</h1>
        <p className="mt-2 text-sm text-slate-600">
          Keep this page open. You will be alerted here as soon as you are dispatched.
        </p>
      </Card>
    );
  }

  const toPickup = headingToPickup(trip.status);
  const target = toPickup ? trip.sending : trip.receiving;
  const points = trip.status === 'arrived' ? null : located(trip.ambulance, target);
  const routes = points ? await getRoutes(points) : [];
  const best = routes[0];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              {trip.code} · {trip.ambulance?.plate}
            </p>
            <h1 className="mt-1 text-xl font-bold">{trip.patient_name}</h1>
            <p className="text-sm text-slate-600">
              {SERVICES[trip.service_needed]} · {trip.condition_summary}
            </p>
          </div>
          <Badge tone={URGENCY_TONE[trip.urgency]}>{URGENCY[trip.urgency]}</Badge>
        </div>
        <p className="mt-3 text-sm font-semibold text-brand-700">{STATUS[trip.status]}</p>
      </Card>

      <TripControls
        transferId={trip.id}
        status={trip.status}
        target={{ name: target.name, lat: target.lat, lng: target.lng }}
      />

      <Card className="overflow-hidden">
        {best && (
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
            <p className="font-semibold">
              {toPickup ? 'To pickup' : 'To hospital'}: {formatKm(best.km)} · {best.minutes} min
            </p>
            <p className="text-xs text-slate-500">
              {best.estimated
                ? 'Straight-line estimate (routing unavailable)'
                : routes.length > 1
                  ? 'Fastest in green, alternatives in grey'
                  : 'Fastest route by road'}
            </p>
          </div>
        )}
        <TrackingMap
          pickup={
            trip.sending.lat != null && trip.sending.lng != null
              ? { lat: trip.sending.lat, lng: trip.sending.lng, name: trip.sending.name }
              : null
          }
          destination={
            trip.receiving.lat != null && trip.receiving.lng != null
              ? { lat: trip.receiving.lat, lng: trip.receiving.lng, name: trip.receiving.name }
              : null
          }
          ambulanceId={trip.ambulance_id}
          ambulance={trip.ambulance}
          routes={routes}
        />
      </Card>

      {(trip.status === 'patient_onboard' || trip.status === 'arrived') && (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Trip costs</h2>
          <CostsForm
            transferId={trip.id}
            consumables={trip.consumables_cost}
            other={trip.other_cost}
          />
        </Card>
      )}

      <Card className="divide-y divide-slate-100">
        {[
          { label: 'Pickup (A)', org: trip.sending },
          { label: 'Destination (B)', org: trip.receiving },
        ].map(({ label, org }) => (
          <div key={label} className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
              <p className="font-medium">{org.name}</p>
              <p className="truncate text-sm text-slate-500">{org.address ?? org.county}</p>
            </div>
            <a
              href={`tel:${org.phone.replace(/\s/g, '')}`}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700"
            >
              <Phone className="h-4 w-4" /> Call
            </a>
          </div>
        ))}
      </Card>
    </div>
  );
}
