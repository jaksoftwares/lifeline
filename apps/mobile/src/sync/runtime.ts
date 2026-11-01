import AsyncStorage from '@react-native-async-storage/async-storage';
import { type CrewStatus } from '@lifeline/domain';
import {
  type CrewSyncResponse,
  crewStatusUpdateSchema,
  type LocationPing,
  locationPingSchema,
} from '@lifeline/schemas';
import * as Crypto from 'expo-crypto';
import { useNetworkState } from 'expo-network';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { api, ApiError } from '../api/client';
import { RejectedBatchError, type Snapshot, SyncQueue } from './queue';

/** One queue per app, shared by the screens and the background location task. */
export const queue = new SyncQueue(AsyncStorage, async (batch) => {
  try {
    return await api<CrewSyncResponse>('/crew/sync', { method: 'POST', body: batch });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400)
      throw new RejectedBatchError(error.message, 400);
    throw error;
  }
});

export function useQueue(): Snapshot {
  return useSyncExternalStore(
    (listener) => queue.subscribe(listener),
    () => cached(),
  );
}

// useSyncExternalStore needs the same object until something changes.
let last: Snapshot | null = null;
queue.subscribe((s) => {
  last = s;
});
function cached(): Snapshot {
  last ??= queue.snapshot();
  return last;
}

/** Records a button press on the phone first, then tries to send it straight away. */
export async function recordStatus(
  assignmentId: string,
  status: CrewStatus,
  extra: { note?: string; latitude?: number; longitude?: number } = {},
): Promise<void> {
  const update = crewStatusUpdateSchema.parse({
    clientId: Crypto.randomUUID(),
    assignmentId,
    status,
    occurredAt: new Date().toISOString(),
    ...extra,
  });
  await queue.enqueueStatus(update);
  void queue.flush();
}

/** Positions outside the schema's bounds (e.g. an emulator's default location) are dropped here. */
export async function recordLocations(pings: LocationPing[]): Promise<void> {
  const valid = pings.filter((p) => locationPingSchema.safeParse(p).success);
  await queue.enqueueLocations(valid);
}

const BUSY_INTERVAL_MS = 15_000;
const IDLE_INTERVAL_MS = 60_000;

/**
 * Keeps the queue moving: on start, whenever the connection comes back, when the app returns to the
 * foreground, and on a timer (faster while anything is waiting to be sent).
 */
export function useAutoSync(enabled: boolean): void {
  const network = useNetworkState();
  const snapshot = useQueue();
  const pending = snapshot.statuses.length + snapshot.locations.length;
  const connected = network.isConnected !== false && network.isInternetReachable !== false;

  useEffect(() => {
    if (enabled && connected) void queue.flush();
  }, [enabled, connected]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void queue.flush();
    });
    return () => sub.remove();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(
      () => void queue.flush(),
      pending > 0 ? BUSY_INTERVAL_MS : IDLE_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [enabled, pending]);
}
