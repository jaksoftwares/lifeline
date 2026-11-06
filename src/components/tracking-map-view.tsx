'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { TrackingMapProps } from './tracking-map';

const pin = (label: string, color: string) =>
  L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="width:30px;height:30px;border-radius:9999px;background:${color};color:#fff;font:700 13px system-ui;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${label}</div>`,
  });

const AMBULANCE_ICON = L.divIcon({
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  html: `<div style="width:36px;height:36px;border-radius:9999px;background:#dc2626;border:3px solid #fff;box-shadow:0 0 0 6px rgba(220,38,38,.25),0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></div>`,
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
    // Fit once per set of places, not on every ambulance move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

export default function TrackingMapView({
  pickup,
  destination,
  ambulance,
  routes,
}: Omit<TrackingMapProps, 'ambulanceId' | 'ambulance'> & {
  ambulance: { lat: number; lng: number } | null;
}) {
  const places = useMemo(
    () =>
      [pickup, destination]
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => [p.lat, p.lng] as [number, number]),
    [pickup, destination],
  );
  const pickupIcon = useMemo(() => pin('A', '#0d8a76'), []);
  const destinationIcon = useMemo(() => pin('B', '#0e4841'), []);

  return (
    <MapContainer
      center={places[0] ?? [-1.2864, 36.8172]}
      zoom={12}
      className="z-0 h-80 w-full sm:h-96"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={ambulance ? [...places, [ambulance.lat, ambulance.lng]] : places} />
      {/* Alternatives first (underneath), then the recommended route on top. */}
      {routes.slice(1).map((r, i) => (
        <Polyline
          key={i}
          positions={r.path}
          pathOptions={{ color: '#94a3b8', weight: 5, opacity: 0.8 }}
        />
      ))}
      {routes[0] && (
        <Polyline positions={routes[0].path} pathOptions={{ color: '#0d8a76', weight: 6 }} />
      )}
      {pickup && (
        <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon}>
          <Tooltip>Pickup: {pickup.name}</Tooltip>
        </Marker>
      )}
      {destination && (
        <Marker position={[destination.lat, destination.lng]} icon={destinationIcon}>
          <Tooltip>Destination: {destination.name}</Tooltip>
        </Marker>
      )}
      {ambulance && (
        <Marker position={[ambulance.lat, ambulance.lng]} icon={AMBULANCE_ICON} zIndexOffset={1000}>
          <Tooltip>Ambulance</Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}
