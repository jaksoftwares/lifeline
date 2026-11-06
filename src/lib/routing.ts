import 'server-only';
import { roughRoute, type LatLng } from './geo';

export interface Route {
  km: number;
  minutes: number;
  /** [lat, lng] points along the road. */
  path: [number, number][];
  /** True when OSRM was unreachable and this is a straight-line estimate. */
  estimated?: boolean;
}

// OpenStreetMap routing (OSRM). The public demo server is fine for pilots; set OSRM_URL to a
// self-hosted one for production. It has no live traffic: Google routing can replace it later.
const OSRM_URL = process.env.OSRM_URL ?? 'https://router.project-osrm.org';

/**
 * Driving routes through the given points, fastest first. With two points, alternatives are
 * included. Never throws: falls back to a straight-line estimate.
 */
export async function getRoutes(points: LatLng[]): Promise<Route[]> {
  if (points.length < 2) return [];
  const coords = points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const alternatives = points.length === 2 ? 'true' : 'false';
  try {
    const res = await fetch(
      `${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=${alternatives}`,
      { signal: AbortSignal.timeout(5000), cache: 'no-store' },
    );
    const data = (await res.json()) as {
      code: string;
      routes?: {
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
      }[];
    };
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error(data.code);
    return data.routes.map((r) => ({
      km: Math.round(r.distance / 100) / 10,
      minutes: Math.round(r.duration / 60),
      path: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    }));
  } catch (error) {
    console.warn('OSRM routing unavailable, using an estimate', error);
    const rough = roughRoute(points);
    return rough ? [{ ...rough, path: points.map((p) => [p.lat, p.lng]), estimated: true }] : [];
  }
}

/** Points with a known location, or null if any is missing. */
export function located(
  ...items: ({ lat: number | null; lng: number | null } | null | undefined)[]
) {
  if (items.some((i) => i?.lat == null || i.lng == null)) return null;
  return items.map((i) => ({ lat: i!.lat!, lng: i!.lng! }));
}
