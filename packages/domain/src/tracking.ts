import { type TransferStatus } from './transport';

/**
 * Live tracking (Phase 5). Positions come from the crew app and can be delayed by poor signal, so
 * every position is shown with its age, and arrival estimates stop when the position is too old.
 */

/** Positions are collected from dispatch until arrival. */
export const TRACKED_STATUSES: readonly TransferStatus[] = [
  'DISPATCHED',
  'AT_PICKUP',
  'PATIENT_COLLECTED',
  'IN_TRANSIT',
  'INTERRUPTED',
];

export function isTracked(status: TransferStatus): boolean {
  return TRACKED_STATUSES.includes(status);
}

export type EtaTarget = 'PICKUP' | 'DESTINATION';

/** Where the ambulance is heading now, or null when it is at a stop or not moving the patient. */
export function etaTarget(status: TransferStatus): EtaTarget | null {
  if (status === 'DISPATCHED') return 'PICKUP';
  if (status === 'PATIENT_COLLECTED' || status === 'IN_TRANSIT') return 'DESTINATION';
  return null;
}

/** The app sends a fix every 30 s or 50 m; older than this suggests lost signal. */
export const LOCATION_DELAYED_AFTER_SECONDS = 3 * 60;
/** Beyond this the position is too old to estimate arrival from. */
export const LOCATION_LOST_AFTER_SECONDS = 15 * 60;

export type LocationFreshness = 'LIVE' | 'DELAYED' | 'LOST';

export function locationFreshness(recordedAt: Date, now: Date): LocationFreshness {
  const age = (now.getTime() - recordedAt.getTime()) / 1000;
  if (age > LOCATION_LOST_AFTER_SECONDS) return 'LOST';
  if (age > LOCATION_DELAYED_AFTER_SECONDS) return 'DELAYED';
  return 'LIVE';
}

export const FRESHNESS_LABELS: Record<LocationFreshness, string> = {
  LIVE: 'Live',
  DELAYED: 'Delayed: the crew may have no signal',
  LOST: 'Position out of date: call the crew',
};

/**
 * Keeps a trail drawable: at most `max` points, evenly spaced, always including the first and last.
 */
export function thinPath<T>(points: readonly T[], max: number): T[] {
  if (points.length <= max) return [...points];
  if (max < 2) return points.slice(-1);
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]!);
}
