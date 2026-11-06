'use client';

import 'leaflet/dist/leaflet.css';
import { type LocationFreshness } from '@lifeline/domain';
import { colors } from '@lifeline/tokens';
import { type LatLngBoundsExpression } from 'leaflet';
import Link from 'next/link';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip } from 'react-leaflet';

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ??
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export interface MapPlace {
  name: string;
  latitude: number | null;
  longitude: number | null;
}

export interface MapAmbulance {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  freshness: LocationFreshness;
  detail?: string;
  href?: string;
}

/** Old positions are drawn hollow and grey, so a stale dot is never mistaken for a live one. */
const AMBULANCE_STYLE: Record<LocationFreshness, { fill: string; opacity: number }> = {
  LIVE: { fill: colors.critical, opacity: 1 },
  DELAYED: { fill: colors.warning, opacity: 1 },
  LOST: { fill: colors.neutral, opacity: 0.25 },
};

export default function TransferMap({
  places = [],
  ambulances,
  path = [],
  height = 360,
}: {
  places?: (MapPlace & { role: 'pickup' | 'destination' })[];
  ambulances: MapAmbulance[];
  path?: [number, number][];
  height?: number;
}) {
  const located = places.filter(
    (p): p is MapPlace & { role: 'pickup' | 'destination'; latitude: number; longitude: number } =>
      p.latitude != null && p.longitude != null,
  );
  const points: [number, number][] = [
    ...located.map((p) => [p.latitude, p.longitude] as [number, number]),
    ...ambulances.map((a) => [a.latitude, a.longitude] as [number, number]),
    ...path,
  ];
  if (points.length === 0) {
    return <p className="p-5 text-sm text-slate">No locations to show yet.</p>;
  }
  const bounds: LatLngBoundsExpression = points;

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [40, 40], maxZoom: 13 }}
      scrollWheelZoom={false}
      style={{ height }}
      className="w-full rounded-b-md"
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      {path.length > 1 && (
        <Polyline
          positions={path}
          pathOptions={{ color: colors.tealDeep, weight: 4, opacity: 0.7 }}
        />
      )}
      {located.map((p) => (
        <CircleMarker
          key={p.role}
          center={[p.latitude, p.longitude]}
          radius={8}
          pathOptions={{
            color: '#FFFFFF',
            weight: 2,
            fillColor: p.role === 'pickup' ? colors.teal : colors.navy,
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]} permanent>
            {p.role === 'pickup' ? 'Pickup: ' : 'Destination: '}
            {p.name}
          </Tooltip>
        </CircleMarker>
      ))}
      {ambulances.map((a) => {
        const style = AMBULANCE_STYLE[a.freshness];
        return (
          <CircleMarker
            key={a.id}
            center={[a.latitude, a.longitude]}
            radius={10}
            pathOptions={{
              color: a.freshness === 'LOST' ? colors.neutral : '#FFFFFF',
              weight: 3,
              fillColor: style.fill,
              fillOpacity: style.opacity,
            }}
          >
            <Tooltip direction="top" offset={[0, -10]}>
              {a.label}
            </Tooltip>
            {(a.detail || a.href) && (
              <Popup>
                <p className="font-semibold">{a.label}</p>
                {a.detail && <p>{a.detail}</p>}
                {a.href && <Link href={a.href}>Open transfer</Link>}
              </Popup>
            )}
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
