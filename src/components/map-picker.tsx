'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';

export interface Point {
  lat: number;
  lng: number;
}

function ClickToPick({ onPick }: { onPick: (p: Point) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FollowPoint({ point }: { point: Point | null }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.setView([point.lat, point.lng], Math.max(map.getZoom(), 14));
  }, [map, point]);
  return null;
}

export default function MapPicker({
  value,
  onChange,
}: {
  value: Point | null;
  onChange: (p: Point) => void;
}) {
  return (
    <MapContainer
      center={value ? [value.lat, value.lng] : [-1.2864, 36.8172]}
      zoom={value ? 14 : 7}
      className="z-0 h-64 w-full rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickToPick onPick={onChange} />
      <FollowPoint point={value} />
      {value && (
        <CircleMarker
          center={[value.lat, value.lng]}
          radius={10}
          pathOptions={{ color: '#0d8a76', fillColor: '#14a38b', fillOpacity: 0.9 }}
        />
      )}
    </MapContainer>
  );
}
