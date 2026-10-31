'use client';

import 'leaflet/dist/leaflet.css';
import { type LatLngBoundsExpression } from 'leaflet';
import Link from 'next/link';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from 'react-leaflet';

export interface MapPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  detail?: string;
  /** The user's own facility, drawn in teal. */
  isOrigin?: boolean;
}

// Defaults to OpenStreetMap's public tiles, which suit development and low-volume pilots.
// Set NEXT_PUBLIC_MAP_TILE_URL to a commercial provider before wider rollout.
const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ??
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export default function FacilityMap({ points }: { points: MapPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="p-5 text-sm text-slate">
        None of these facilities have a location recorded yet.
      </p>
    );
  }
  const bounds: LatLngBoundsExpression = points.map((p) => [p.latitude, p.longitude]);

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [40, 40], maxZoom: 12 }}
      scrollWheelZoom={false}
      className="h-[480px] w-full rounded-b-md"
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.latitude, p.longitude]}
          radius={p.isOrigin ? 9 : 8}
          pathOptions={{
            color: '#FFFFFF',
            weight: 2,
            fillColor: p.isOrigin ? '#0F8B8D' : '#12304A',
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            {p.isOrigin ? `${p.name} (your facility)` : p.name}
          </Tooltip>
          {!p.isOrigin && (
            <Popup>
              <p className="font-semibold">{p.name}</p>
              {p.detail && <p>{p.detail}</p>}
              <Link href={`/network/${p.id}`}>View facility</Link>
            </Popup>
          )}
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
