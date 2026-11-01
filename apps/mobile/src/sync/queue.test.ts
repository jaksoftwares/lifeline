import { randomUUID } from 'node:crypto';
import { type CrewStatus, evaluateCrewUpdate, type TransferStatus } from '@lifeline/domain';
import {
  type CrewStatusUpdate,
  type CrewSyncInput,
  type CrewSyncResponse,
  type CrewTrip,
} from '@lifeline/schemas';
import { describe, expect, it } from 'vitest';
import {
  effectiveStatus,
  type KeyValueStore,
  MAX_STORED_LOCATIONS,
  RejectedBatchError,
  SyncQueue,
} from './queue';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  async getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

const trip = (status: TransferStatus): CrewTrip =>
  ({ assignmentId: 'a1', transferId: 't1', status }) as CrewTrip;

/** A stand-in for the API: applies the same rules, remembers press ids, and can lose signal. */
class FakeServer {
  status: TransferStatus = 'DISPATCHED';
  seen = new Set<string>();
  applied: CrewStatusUpdate[] = [];
  locations = new Map<string, number>();
  online = false;
  requests: CrewSyncInput[] = [];
  /** Simulates the response being lost after the server has applied the batch. */
  dropNextResponse = false;

  transport = async (batch: CrewSyncInput): Promise<CrewSyncResponse> => {
    if (!this.online) throw new TypeError('Network request failed');
    this.requests.push(batch);
    const statusResults = batch.statusUpdates.map((u) => {
      if (this.seen.has(u.clientId)) return { clientId: u.clientId, outcome: 'DUPLICATE' as const };
      const decision = evaluateCrewUpdate(this.status, u.status);
      if (decision.outcome === 'REJECTED')
        return {
          clientId: u.clientId,
          outcome: 'REJECTED' as const,
          reason: 'INVALID_TRANSITION' as const,
          message: 'Out of order',
        };
      if (decision.outcome === 'ALREADY_RECORDED')
        return { clientId: u.clientId, outcome: 'ALREADY_RECORDED' as const };
      this.seen.add(u.clientId);
      this.status = u.status;
      this.applied.push(u);
      return { clientId: u.clientId, outcome: 'APPLIED' as const };
    });
    for (const p of batch.locations) this.locations.set(p.recordedAt, p.latitude);
    if (this.dropNextResponse) {
      this.dropNextResponse = false;
      throw new TypeError('Network request failed');
    }
    return {
      statusResults,
      locationsAccepted: batch.locations.length,
      trips: [trip(this.status)],
      serverTime: new Date().toISOString(),
    };
  };
}

let minute = 0;
const press = (status: CrewStatus, note?: string): CrewStatusUpdate => ({
  clientId: randomUUID(),
  assignmentId: 'a1',
  status,
  occurredAt: new Date(Date.UTC(2026, 10, 1, 8, minute++)).toISOString(),
  ...(note ? { note } : {}),
});
const ping = (i: number) => ({
  assignmentId: 'a1',
  recordedAt: new Date(Date.UTC(2026, 10, 1, 8, 0, i)).toISOString(),
  latitude: -1 - i / 1000,
  longitude: 36.9,
});

describe('SyncQueue', () => {
  it('syncs status updates correctly after an offline period, even across an app restart', async () => {
    const store = new MemoryStore();
    const server = new FakeServer();
    const queue = new SyncQueue(store, server.transport);

    const presses = [press('AT_PICKUP'), press('PATIENT_COLLECTED'), press('IN_TRANSIT')];
    for (const p of presses) await queue.enqueueStatus(p);
    await queue.enqueueLocations([ping(1), ping(2), ping(3)]);
    await queue.flush();

    // Offline: nothing lost, the error is shown, and the crew sees their own progress.
    expect(queue.snapshot()).toMatchObject({ lastError: 'Network request failed' });
    expect(queue.snapshot().statuses).toHaveLength(3);
    expect(effectiveStatus(trip('DISPATCHED'), queue.snapshot().statuses)).toBe('IN_TRANSIT');

    // The phone restarts while still offline.
    const restarted = new SyncQueue(store, server.transport);
    await restarted.load();
    expect(restarted.snapshot().statuses.map((s) => s.status)).toEqual([
      'AT_PICKUP',
      'PATIENT_COLLECTED',
      'IN_TRANSIT',
    ]);

    server.online = true;
    await restarted.flush();
    expect(server.applied.map((u) => [u.status, u.occurredAt])).toEqual(
      presses.map((p) => [p.status, p.occurredAt]),
    );
    expect(server.locations.size).toBe(3);
    expect(restarted.snapshot()).toMatchObject({
      statuses: [],
      locations: [],
      conflicts: [],
      lastError: null,
      trips: [{ status: 'IN_TRANSIT' }],
    });
  });

  it('sends a batch again when the response is lost, and the server records it once', async () => {
    const server = new FakeServer();
    server.online = true;
    server.dropNextResponse = true;
    const queue = new SyncQueue(new MemoryStore(), server.transport);
    await queue.enqueueStatus(press('AT_PICKUP'));
    await queue.flush();
    expect(queue.snapshot().statuses).toHaveLength(1);

    await queue.flush();
    expect(server.applied).toHaveLength(1);
    expect(queue.snapshot().statuses).toEqual([]);
    expect(queue.snapshot().conflicts).toEqual([]);
  });

  it('keeps rejected updates as conflicts until the crew dismisses them', async () => {
    const server = new FakeServer();
    server.online = true;
    const queue = new SyncQueue(new MemoryStore(), server.transport);
    const skipped = press('ARRIVED');
    await queue.enqueueStatus(skipped);
    await queue.flush();
    expect(queue.snapshot().conflicts).toMatchObject([
      { clientId: skipped.clientId, status: 'ARRIVED', reason: 'INVALID_TRANSITION' },
    ]);
    await queue.dismissConflict(skipped.clientId);
    expect(queue.snapshot().conflicts).toEqual([]);
  });

  it('sends large backlogs in batches, oldest first', async () => {
    const server = new FakeServer();
    server.online = true;
    const queue = new SyncQueue(new MemoryStore(), server.transport);
    await queue.enqueueLocations(Array.from({ length: 1200 }, (_, i) => ping(i)));
    await queue.flush();
    expect(server.requests.map((r) => r.locations.length)).toEqual([500, 500, 200]);
    expect(server.requests[0]!.locations[0]!.recordedAt).toBe(ping(0).recordedAt);
    expect(queue.snapshot().locations).toEqual([]);
  });

  it('keeps only the newest positions after a very long time offline', async () => {
    const queue = new SyncQueue(new MemoryStore(), new FakeServer().transport);
    await queue.enqueueLocations(
      Array.from({ length: MAX_STORED_LOCATIONS + 10 }, (_, i) => ping(i)),
    );
    const kept = queue.snapshot().locations;
    expect(kept).toHaveLength(MAX_STORED_LOCATIONS);
    expect(kept[0]!.recordedAt).toBe(ping(10).recordedAt);
  });

  it('sets aside a batch the server refuses as malformed, so the queue isn’t blocked', async () => {
    let calls = 0;
    const queue = new SyncQueue(new MemoryStore(), async () => {
      calls++;
      if (calls === 1) throw new RejectedBatchError('Check the values.', 400);
      return { statusResults: [], locationsAccepted: 0, trips: [], serverTime: '' };
    });
    await queue.enqueueStatus(press('AT_PICKUP'));
    await queue.flush();
    expect(queue.snapshot().statuses).toEqual([]);
    expect(queue.snapshot().conflicts[0]).toMatchObject({ reason: 'NOT_SENT' });
  });

  it('runs one sync at a time', async () => {
    const server = new FakeServer();
    server.online = true;
    const queue = new SyncQueue(new MemoryStore(), server.transport);
    await queue.enqueueStatus(press('AT_PICKUP'));
    await Promise.all([queue.flush(), queue.flush(), queue.flush()]);
    expect(server.requests).toHaveLength(1);
  });
});
