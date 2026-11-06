export interface LatLng {
  lat: number;
  lng: number;
}

type MaybePoint = { lat: number | null; lng: number | null } | null | undefined;

/** Straight-line distance in km, or null when a location is missing. */
export function distanceKm(a: MaybePoint, b: MaybePoint): number | null {
  if (a?.lat == null || a.lng == null || b?.lat == null || b.lng == null) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Rough road distance and drive time until real routing is used: roads ≈ 1.35× straight line, 40 km/h. */
export function roughRoute(points: MaybePoint[]): { km: number; minutes: number } | null {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    const leg = distanceKm(points[i - 1], points[i]);
    if (leg == null) return null;
    km += leg * 1.35;
  }
  return { km: Math.round(km * 10) / 10, minutes: Math.round((km / 40) * 60) };
}

export const formatKm = (km: number | null) =>
  km == null ? '—' : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
