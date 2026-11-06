import type { Transfer, TransferStatus } from './types';

/** The driver's steps: from each status, the one button that moves the trip forward. */
export const TRIP_STEPS: Partial<
  Record<TransferStatus, { next: TransferStatus; stamp: keyof Transfer; label: string }>
> = {
  ambulance_assigned: {
    next: 'en_route_to_pickup',
    stamp: 'departed_at',
    label: 'Start trip to pickup',
  },
  en_route_to_pickup: {
    next: 'patient_onboard',
    stamp: 'picked_up_at',
    label: 'Patient is onboard',
  },
  patient_onboard: { next: 'arrived', stamp: 'arrived_at', label: 'Arrived at hospital' },
};

/** Statuses while the ambulance is out on this transfer. */
export const TRIP_STATUSES: TransferStatus[] = [
  'ambulance_assigned',
  'en_route_to_pickup',
  'patient_onboard',
  'arrived',
];

/** Where the ambulance is heading now: the sending hospital until pickup, then the receiving one. */
export const headingToPickup = (status: TransferStatus) =>
  status === 'ambulance_assigned' || status === 'en_route_to_pickup';
