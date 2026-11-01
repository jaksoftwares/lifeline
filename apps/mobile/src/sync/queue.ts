import { type CrewStatus, type TransferStatus } from '@lifeline/domain';
import {
  type CrewStatusUpdate,
  type CrewSyncInput,
  type CrewSyncRejection,
  type CrewSyncResponse,
  type CrewTrip,
  type LocationPing,
  MAX_SYNC_LOCATIONS,
  MAX_SYNC_STATUS_UPDATES,
} from '@lifeline/schemas';

/** AsyncStorage's shape, so tests can use a plain map. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export type Transport = (batch: CrewSyncInput) => Promise<CrewSyncResponse>;

/** Thrown by the transport when the server refuses the batch itself (not a network problem). */
export class RejectedBatchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** An update the server refused, kept until the crew has seen it. */
export interface Conflict {
  clientId: string;
  assignmentId: string;
  status: CrewStatus;
  reason: CrewSyncRejection | 'NOT_SENT';
  message: string;
  at: string;
}

export interface QueueState {
  statuses: CrewStatusUpdate[];
  locations: LocationPing[];
  conflicts: Conflict[];
  lastSyncAt: string | null;
  /** Why the last attempt failed, e.g. no connection. Cleared by the next success. */
  lastError: string | null;
  /** Trips as last returned by the server. Shown while offline. */
  trips: CrewTrip[];
}

export interface Snapshot extends QueueState {
  syncing: boolean;
}

const STORAGE_KEY = 'lifeline.crew.queue.v1';
/** Positions kept while offline. At one fix every 30 s this is over 20 hours. */
export const MAX_STORED_LOCATIONS = 2500;

const empty = (): QueueState => ({
  statuses: [],
  locations: [],
  conflicts: [],
  lastSyncAt: null,
  lastError: null,
  trips: [],
});

/**
 * The crew app's outbox. Every button press and position is saved on the device first and sent when
 * there is a connection, oldest first. The server deduplicates by the press's id, so a batch whose
 * response was lost is simply sent again.
 */
export class SyncQueue {
  private state: QueueState = empty();
  private loaded: Promise<void> | null = null;
  private writing: Promise<void> = Promise.resolve();
  private flushing: Promise<void> | null = null;
  private listeners = new Set<(s: Snapshot) => void>();

  constructor(
    private readonly store: KeyValueStore,
    private readonly transport: Transport,
    private readonly now: () => Date = () => new Date(),
  ) {}

  load(): Promise<void> {
    this.loaded ??= this.store.getItem(STORAGE_KEY).then((raw) => {
      if (raw) this.state = { ...empty(), ...(JSON.parse(raw) as Partial<QueueState>) };
      this.emit();
    });
    return this.loaded;
  }

  snapshot(): Snapshot {
    return { ...this.state, syncing: this.flushing !== null };
  }

  subscribe(listener: (s: Snapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Saved to the device before this resolves, so a press survives the app being closed. */
  async enqueueStatus(update: CrewStatusUpdate): Promise<void> {
    await this.load();
    this.state.statuses.push(update);
    await this.persist();
  }

  async enqueueLocations(pings: LocationPing[]): Promise<void> {
    if (pings.length === 0) return;
    await this.load();
    const all = [...this.state.locations, ...pings];
    // Keep the newest if the device has been offline for a very long time.
    this.state.locations = all.slice(-MAX_STORED_LOCATIONS);
    await this.persist();
  }

  async dismissConflict(clientId: string): Promise<void> {
    await this.load();
    this.state.conflicts = this.state.conflicts.filter((c) => c.clientId !== clientId);
    await this.persist();
  }

  /** Replaces the cached trips, e.g. after a plain refresh with nothing to send. */
  async setTrips(trips: CrewTrip[]): Promise<void> {
    await this.load();
    this.state.trips = trips;
    this.state.lastSyncAt = this.now().toISOString();
    this.state.lastError = null;
    await this.persist();
  }

  /** Clears everything, e.g. on sign-out. Unsent updates are lost, so the app warns first. */
  async clear(): Promise<void> {
    await this.load();
    this.state = empty();
    await this.persist();
  }

  /** Sends everything queued, batch by batch. Concurrent calls share one run. */
  flush(): Promise<void> {
    this.flushing ??= this.run().finally(() => {
      this.flushing = null;
      this.emit();
    });
    this.emit();
    return this.flushing;
  }

  private async run(): Promise<void> {
    await this.load();
    let first = true;
    // Always make one request, even with nothing queued, so trips are refreshed.
    while (first || this.state.statuses.length > 0 || this.state.locations.length > 0) {
      first = false;
      const statuses = this.state.statuses.slice(0, MAX_SYNC_STATUS_UPDATES);
      const locations = this.state.locations.slice(0, MAX_SYNC_LOCATIONS);
      let response: CrewSyncResponse;
      try {
        response = await this.transport({ statusUpdates: statuses, locations });
      } catch (error) {
        if (error instanceof RejectedBatchError && error.status === 400) {
          // A malformed batch would block the queue for ever: set it aside and tell the crew.
          this.dropBatch(statuses, locations.length, error.message);
          await this.persist();
          continue;
        }
        this.state.lastError = error instanceof Error ? error.message : 'Couldn’t reach Lifeline.';
        await this.persist();
        return;
      }
      this.applyResponse(statuses, locations.length, response);
      await this.persist();
    }
  }

  private applyResponse(
    sent: CrewStatusUpdate[],
    locationsSent: number,
    response: CrewSyncResponse,
  ) {
    const sentIds = new Set(sent.map((s) => s.clientId));
    this.state.statuses = this.state.statuses.filter((s) => !sentIds.has(s.clientId));
    this.state.locations = this.state.locations.slice(locationsSent);
    for (const result of response.statusResults) {
      if (result.outcome !== 'REJECTED') continue;
      const update = sent.find((s) => s.clientId === result.clientId);
      if (!update) continue;
      this.state.conflicts.push({
        clientId: update.clientId,
        assignmentId: update.assignmentId,
        status: update.status,
        reason: result.reason ?? 'INVALID_TRANSITION',
        message: result.message ?? 'Lifeline couldn’t record this update.',
        at: this.now().toISOString(),
      });
    }
    this.state.trips = response.trips;
    this.state.lastSyncAt = this.now().toISOString();
    this.state.lastError = null;
  }

  private dropBatch(sent: CrewStatusUpdate[], locationsSent: number, message: string) {
    const sentIds = new Set(sent.map((s) => s.clientId));
    this.state.statuses = this.state.statuses.filter((s) => !sentIds.has(s.clientId));
    this.state.locations = this.state.locations.slice(locationsSent);
    for (const update of sent) {
      this.state.conflicts.push({
        clientId: update.clientId,
        assignmentId: update.assignmentId,
        status: update.status,
        reason: 'NOT_SENT',
        message: `Lifeline refused this update: ${message}`,
        at: this.now().toISOString(),
      });
    }
  }

  private persist(): Promise<void> {
    const json = JSON.stringify(this.state);
    // Writes are chained so an older state can never overwrite a newer one.
    this.writing = this.writing.then(() => this.store.setItem(STORAGE_KEY, json));
    this.emit();
    return this.writing;
  }

  private emit() {
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }
}

/**
 * The status to show for a trip: the server's, moved on by any presses still waiting to be sent. The
 * crew sees their own progress straight away, even with no signal.
 */
export function effectiveStatus(
  trip: Pick<CrewTrip, 'assignmentId' | 'status'>,
  pending: Pick<CrewStatusUpdate, 'assignmentId' | 'status'>[],
): TransferStatus {
  const mine = pending.filter((p) => p.assignmentId === trip.assignmentId);
  return mine.at(-1)?.status ?? trip.status;
}
