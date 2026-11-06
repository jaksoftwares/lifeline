import { randomUUID } from 'node:crypto';
import { type AddressInfo } from 'node:net';
import { type INestApplication } from '@nestjs/common';
import { type LiveEvent, type TransferDetail, type TransferSummary } from '@lifeline/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/passwords';
import { bearerToken, createApp, demoIds, prismaOf } from './helpers';
import { TEST_PASSWORD } from './test-env';

let app: INestApplication;
let base: string;
let ids: Awaited<ReturnType<typeof demoIds>>;
const tokens: Record<string, string> = {};
let vehicleId: string;
let crewMemberId: string;

/** An open Server-Sent Events connection that collects what it receives. */
class Stream {
  events: LiveEvent[] = [];
  private controller = new AbortController();
  ready: Promise<void>;

  constructor(token: string) {
    this.ready = new Promise((resolve, reject) => {
      void fetch(`${base}/api/live`, {
        headers: { authorization: `Bearer ${token}` },
        signal: this.controller.signal,
      })
        .then(async (res) => {
          if (res.status !== 200) return reject(new Error(`Stream answered ${res.status}`));
          const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) return;
            buffer += value;
            let end: number;
            while ((end = buffer.indexOf('\n\n')) >= 0) {
              const block = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              if (block.includes('event: ready')) resolve();
              const data = block.split('\n').find((l) => l.startsWith('data: '));
              if (data && !block.includes('event: ready'))
                this.events.push(JSON.parse(data.slice(6)) as LiveEvent);
            }
          }
        })
        .catch((error: unknown) => {
          if ((error as Error).name !== 'AbortError') reject(error as Error);
        });
    });
  }

  async waitFor(predicate: (e: LiveEvent) => boolean, ms = 5000): Promise<LiveEvent> {
    const deadline = Date.now() + ms;
    for (;;) {
      const found = this.events.find(predicate);
      if (found) return found;
      if (Date.now() > deadline) throw new Error('Event not received in time');
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  close() {
    this.controller.abort();
  }
}

const call = async <T>(who: string, path: string, method = 'GET', body?: unknown) => {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { authorization: `Bearer ${tokens[who]}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status >= 400) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
};

beforeAll(async () => {
  app = await createApp();
  await app.listen(0);
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  ids = await demoIds(app);

  // A vehicle and crew account of this file's own, retired afterwards.
  const prisma = prismaOf(app);
  const user = await prisma.user.create({
    data: {
      email: 'crew.live@demo.lifeline.test',
      fullName: 'Fixture Live Crew',
      passwordHash: await hashPassword(TEST_PASSWORD),
      mustChangePassword: false,
    },
  });
  await prisma.membership.create({
    data: {
      userId: user.id,
      networkId: ids.networkId,
      institutionId: ids.ambulance,
      role: 'AMBULANCE_CREW',
    },
  });
  crewMemberId = (
    await prisma.crewMember.create({
      data: {
        institutionId: ids.ambulance,
        fullName: 'Fixture Live Crew',
        qualification: 'EMT',
        userId: user.id,
      },
    })
  ).id;
  vehicleId = (
    await prisma.vehicle.create({
      data: {
        networkId: ids.networkId,
        institutionId: ids.ambulance,
        registration: 'KDT 501C',
        capability: 'ALS',
        equipment: [],
        status: 'AVAILABLE',
        statusUpdatedAt: new Date(),
        baseLatitude: -1.1,
        baseLongitude: 36.9,
      },
    })
  ).id;

  for (const [key, email] of [
    ['clinician', 'clinician.north@demo.lifeline.test'],
    ['east', 'receiving.east@demo.lifeline.test'],
    ['west', 'receiving.west@demo.lifeline.test'],
    ['dispatcher', 'dispatcher@demo.lifeline.test'],
    ['operations', 'operations@demo.lifeline.test'],
    ['crew', 'crew.live@demo.lifeline.test'],
  ] as const) {
    tokens[key] = await bearerToken(app, email);
  }
});

afterAll(async () => {
  await prismaOf(app).vehicle.update({
    where: { id: vehicleId },
    data: { recordStatus: 'INACTIVE' },
  });
  await app.close();
});

describe('all parties see the same live transfer state (Phase 5 done-when)', () => {
  let transferId: string;
  let assignmentId: string;
  const streams: Record<string, Stream> = {};

  it('sets up a confirmed trip', async () => {
    const referral = await call<{ id: string }>('clinician', '/referrals', 'POST', {
      referringInstitutionId: ids.north,
      patient: {
        fullName: 'Njeri Wambui',
        sex: 'FEMALE',
        estimatedAge: 61,
        estimatedAgeUnit: 'YEARS',
      },
      pregnancyStatus: 'NOT_APPLICABLE',
      reason: 'Stroke within the thrombolysis window; needs CT.',
      clinicalSummary: 'Right-sided weakness and slurred speech since 09:40.',
      urgency: 'EMERGENCY',
    });
    await call('clinician', `/referrals/${referral.id}/submit`, 'POST', {
      institutionIds: [ids.east],
    });
    const detail = await call<{ requests: { id: string }[] }>(
      'clinician',
      `/referrals/${referral.id}`,
    );
    await call('east', `/referral-requests/${detail.requests[0]!.id}/respond`, 'POST', {
      decision: 'ACCEPT',
    });
    transferId = (
      await call<{ id: string }>('clinician', `/referrals/${referral.id}/transfer`, 'POST', {
        requiredCapability: 'ALS',
      })
    ).id;
    assignmentId = (
      await call<{ id: string }>('clinician', `/transfers/${transferId}/offers`, 'POST', {
        vehicleId,
      })
    ).id;
    await call('dispatcher', `/dispatch-assignments/${assignmentId}/confirm`, 'POST', {
      vehicleId,
      crewMemberIds: [crewMemberId],
    });
    // Confirmed half an hour ago, so the old positions below fall within the trip.
    await prismaOf(app).dispatchAssignment.update({
      where: { id: assignmentId },
      data: { respondedAt: new Date(Date.now() - 30 * 60_000) },
    });
  });

  it('shows a position too old to trust as out of date, with no arrival estimate', async () => {
    await call('crew', '/crew/sync', 'POST', {
      statusUpdates: [
        {
          clientId: randomUUID(),
          assignmentId,
          status: 'DISPATCHED',
          occurredAt: new Date(Date.now() - 25 * 60_000).toISOString(),
        },
      ],
      locations: [
        {
          assignmentId,
          recordedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
          latitude: -1.1,
          longitude: 36.9,
        },
      ],
    });
    const view = await call<TransferDetail>('clinician', `/transfers/${transferId}`);
    expect(view.tracking).toMatchObject({ position: { freshness: 'LOST' }, eta: null });
  });

  it('pushes each change to everyone involved, and nobody else', async () => {
    for (const who of ['clinician', 'east', 'dispatcher', 'operations', 'west']) {
      streams[who] = new Stream(tokens[who]!);
      await streams[who].ready;
    }

    const now = Date.now();
    await call('crew', '/crew/sync', 'POST', {
      statusUpdates: [],
      locations: [0, 1, 2].map((i) => ({
        assignmentId,
        recordedAt: new Date(now - (2 - i) * 30_000).toISOString(),
        latitude: -1.06 + i * 0.01,
        longitude: 36.9,
        accuracy: 10,
      })),
    });
    await call('crew', '/crew/sync', 'POST', {
      statusUpdates: [
        {
          clientId: randomUUID(),
          assignmentId,
          status: 'AT_PICKUP',
          occurredAt: new Date().toISOString(),
        },
      ],
    });

    for (const who of ['clinician', 'east', 'dispatcher', 'operations']) {
      await streams[who]!.waitFor((e) => e.type === 'position' && e.transferId === transferId);
      await streams[who]!.waitFor(
        (e) => e.type === 'transfer' && e.transferId === transferId && e.status === 'AT_PICKUP',
      );
    }
    // Give the unrelated facility's stream time to receive anything it shouldn't.
    await new Promise((r) => setTimeout(r, 300));
    expect(streams.west!.events.filter((e) => e.transferId === transferId)).toEqual([]);
  });

  it('gives everyone the same status, position and history when they reload', async () => {
    const views = await Promise.all(
      ['clinician', 'east', 'dispatcher', 'operations'].map((who) =>
        call<TransferDetail>(who, `/transfers/${transferId}`),
      ),
    );
    const shared = (v: TransferDetail) => ({
      status: v.status,
      position: v.tracking?.position,
      eta: v.tracking?.eta,
      atPickupAt: v.atPickupAt,
    });
    for (const v of views) expect(shared(v)).toEqual(shared(views[0]!));
    expect(views[0]!.status).toBe('AT_PICKUP');
    expect(views[0]!.tracking?.position).toMatchObject({ latitude: -1.04, freshness: 'LIVE' });
    expect(views[0]!.tracking?.path).toHaveLength(4);
    // At the pickup the ambulance isn't heading anywhere, so there is no estimate.
    expect(views[0]!.tracking?.eta).toBeNull();
  });

  it('estimates arrival at the destination once the patient is on board', async () => {
    const press = (status: string) => ({
      clientId: randomUUID(),
      assignmentId,
      status,
      occurredAt: new Date().toISOString(),
    });
    await call('crew', '/crew/sync', 'POST', {
      statusUpdates: [press('PATIENT_COLLECTED'), press('IN_TRANSIT')],
    });
    const view = await call<TransferDetail>('east', `/transfers/${transferId}`);
    expect(view.tracking?.eta).toMatchObject({ target: 'DESTINATION', source: 'ESTIMATE' });
    expect(view.tracking!.eta!.minutes).toBeGreaterThan(30);

    // The operations board shows the same estimate.
    const board = await call<TransferSummary[]>(
      'operations',
      `/transfers?networkId=${ids.networkId}&box=network&open=true`,
    );
    expect(board.find((t) => t.id === transferId)?.tracking).toEqual({
      position: view.tracking!.position,
      eta: view.tracking!.eta,
    });
  });

  it('refuses the stream without a session', async () => {
    const res = await fetch(`${base}/api/live`);
    expect(res.status).toBe(401);
    for (const s of Object.values(streams)) s.close();
  });
});
