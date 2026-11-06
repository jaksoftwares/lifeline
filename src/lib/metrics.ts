import type { Transfer } from './types';

/** Fuel cost in KES: distance × litres per 100 km × price per litre. */
export function fuelCost(km: number | null, fuelUse: number | null, fuelPrice: number | null) {
  if (km == null || fuelUse == null || fuelPrice == null) return null;
  return Math.round(((km * fuelUse) / 100) * fuelPrice);
}

const minutesBetween = (from: string | null, to: string | null) =>
  from && to
    ? Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000))
    : null;

/** How long each stage of a transfer took, in minutes (null if not reached). */
export function stageMinutes(t: Transfer) {
  return {
    toAcceptance: minutesBetween(t.requested_at, t.responded_at),
    toDispatch: minutesBetween(t.ambulance_requested_at, t.assigned_at),
    toPickup: minutesBetween(t.departed_at, t.picked_up_at),
    transport: minutesBetween(t.picked_up_at, t.arrived_at),
    handover: minutesBetween(t.arrived_at, t.handed_over_at),
    total: minutesBetween(t.requested_at, t.handed_over_at),
  };
}

export function formatMinutes(minutes: number | null) {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}
