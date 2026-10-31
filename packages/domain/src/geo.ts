export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Rough drive time when no routing service is configured: roads are taken as 1.4× the straight
 * line, travelled at 40 km/h on average. Always presented to users as an estimate.
 */
export const ROAD_FACTOR = 1.4;
export const AVERAGE_SPEED_KMH = 40;

export function estimateDriveMinutes(straightLineKm: number): number {
  return Math.max(1, Math.round(((straightLineKm * ROAD_FACTOR) / AVERAGE_SPEED_KMH) * 60));
}
