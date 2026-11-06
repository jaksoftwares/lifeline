import { type EtaTarget, type LocationFreshness, type TransferStatus } from '@lifeline/domain';

/** Where the ambulance is and when it should arrive, as everyone involved sees it. */
export interface TrackingView {
  position: {
    latitude: number;
    longitude: number;
    /** Metres. */
    accuracy: number | null;
    recordedAt: string;
    freshness: LocationFreshness;
  } | null;
  eta: {
    target: EtaTarget;
    minutes: number;
    /** ROAD: from a routing service; ESTIMATE: straight line × 1.4 at 40 km/h. */
    source: 'ROAD' | 'ESTIMATE';
    /** Time of the position it was worked out from. */
    from: string;
  } | null;
  /** Recent trail for the map, oldest first, thinned. */
  path: [number, number][];
}

/**
 * Pushed to signed-in browsers over Server-Sent Events. Events say only what changed; pages then
 * reload the transfer through the API, which applies each viewer's permissions.
 */
export type LiveEvent =
  | { type: 'transfer'; transferId: string; status: TransferStatus; at: string }
  | { type: 'position'; transferId: string; at: string };
