import { TrackingMap } from '@/components/tracking-map';
import { Card } from '@/components/ui';
import { formatKm } from '@/lib/geo';
import { getRoutes, located } from '@/lib/routing';
import { headingToPickup, TRIP_STATUSES } from '@/lib/trip';
import type { TransferDetail } from './page';

const place = (o: TransferDetail['sending']) =>
  o.lat != null && o.lng != null ? { lat: o.lat, lng: o.lng, name: o.name } : null;

/** While the ambulance is out: where it is, the road route and the time to its next stop. */
export async function LiveTracking({ transfer: t }: { transfer: TransferDetail }) {
  if (!TRIP_STATUSES.includes(t.status) || !t.ambulance) return null;

  const toPickup = headingToPickup(t.status);
  const target = toPickup ? t.sending : t.receiving;
  const points = t.status === 'arrived' ? null : located(t.ambulance, target);
  const routes = points ? await getRoutes(points) : [];
  const best = routes[0];

  const headline =
    t.status === 'arrived'
      ? `Ambulance has arrived at ${t.receiving.name}`
      : t.status === 'ambulance_assigned'
        ? `Ambulance is ${best ? `${formatKm(best.km)} (about ${best.minutes} min)` : 'getting ready'} from pickup`
        : best
          ? `About ${best.minutes} min to ${toPickup ? 'pickup' : t.receiving.name} · ${formatKm(best.km)}`
          : `On the way to ${toPickup ? 'pickup' : t.receiving.name}`;

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4">
        <p className="text-xs font-semibold uppercase text-slate-500">Live tracking</p>
        <p className="text-base font-semibold sm:text-lg">{headline}</p>
        {best && !best.estimated && (
          <p className="text-xs text-slate-500">Fastest road route · no live traffic</p>
        )}
      </div>
      <TrackingMap
        pickup={place(t.sending)}
        destination={place(t.receiving)}
        ambulanceId={t.ambulance_id}
        ambulance={t.ambulance}
        routes={routes}
      />
    </Card>
  );
}
