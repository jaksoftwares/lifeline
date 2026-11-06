import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import {
  type AuthStepResponse,
  type CrewSyncResponse,
  type CrewTrip,
  type MobileTokens,
  type TransferDetail,
} from '@lifeline/schemas';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/passwords';
import { type Agent, cookieFrom, createApp, demoIds, prismaOf, signIn } from './helpers';
import { TEST_PASSWORD } from './test-env';

let app: INestApplication;
let ids: Awaited<ReturnType<typeof demoIds>>;
let clinician: Agent;
let east: Agent;
let dispatcher: Agent;
let crewA: string;
let crewB: string;
const fixture: { vehicles: Record<string, string>; crew: Record<string, string> } = {
  vehicles: {},
  crew: {},
};

const http = () => request(app.getHttpServer());

/** Signs in the way the crew app does and returns its access token. */
async function mobileSignIn(email: string): Promise<MobileTokens> {
  const res = await http()
    .post('/api/auth/login')
    .set('X-Lifeline-Client', 'mobile')
    .send({ email, password: TEST_PASSWORD });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const body = res.body as AuthStepResponse;
  if (body.step !== 'AUTHENTICATED' || !body.tokens) throw new Error('No tokens');
  return body.tokens;
}

const sync = async (token: string, body: Record<string, unknown>) => {
  const res = await http()
    .post('/api/crew/sync')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as CrewSyncResponse;
};

const trips = async (token: string) => {
  const res = await http().get('/api/crew/trips').set('Authorization', `Bearer ${token}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as CrewTrip[];
};

const press = (assignmentId: string, status: string, minutesAgo: number, note?: string) => ({
  clientId: randomUUID(),
  assignmentId,
  status,
  occurredAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  ...(note ? { note } : {}),
});

/** Crew accounts, crew members and vehicles used only by this file. */
async function createFixtures() {
  const prisma = prismaOf(app);
  const passwordHash = await hashPassword(TEST_PASSWORD);
  for (const [key, email, name, qualification] of [
    ['A', 'crew.a@demo.lifeline.test', 'Fixture Paramedic A', 'PARAMEDIC'],
    ['B', 'crew.b@demo.lifeline.test', 'Fixture EMT B', 'EMT'],
    ['D', null, 'Fixture Driver D', 'DRIVER'],
    ['E', null, 'Fixture Driver E', 'DRIVER'],
  ] as const) {
    let userId: string | null = null;
    if (email) {
      const user = await prisma.user.create({
        data: { email, fullName: name, passwordHash, mustChangePassword: false },
      });
      await prisma.membership.create({
        data: {
          userId: user.id,
          networkId: ids.networkId,
          institutionId: ids.ambulance,
          role: 'AMBULANCE_CREW',
        },
      });
      userId = user.id;
    }
    const member = await prisma.crewMember.create({
      data: { institutionId: ids.ambulance, fullName: name, qualification, userId },
    });
    fixture.crew[key] = member.id;
  }
  for (const registration of ['KDT 401A', 'KDT 402B']) {
    const vehicle = await prisma.vehicle.create({
      data: {
        networkId: ids.networkId,
        institutionId: ids.ambulance,
        registration,
        capability: 'ALS',
        equipment: ['OXYGEN'],
        status: 'AVAILABLE',
        statusUpdatedAt: new Date(),
        baseLatitude: -1.02,
        baseLongitude: 36.9,
      },
    });
    fixture.vehicles[registration] = vehicle.id;
  }
}

beforeAll(async () => {
  app = await createApp();
  ids = await demoIds(app);
  await createFixtures();
  clinician = (await signIn(app, 'clinician.north@demo.lifeline.test')).agent;
  east = (await signIn(app, 'receiving.east@demo.lifeline.test')).agent;
  dispatcher = (await signIn(app, 'dispatcher@demo.lifeline.test')).agent;
  crewA = (await mobileSignIn('crew.a@demo.lifeline.test')).accessToken;
  crewB = (await mobileSignIn('crew.b@demo.lifeline.test')).accessToken;
});

afterAll(async () => {
  // Retired vehicles are never suggested, so the other test files see the demo fleet unchanged.
  await prismaOf(app).vehicle.updateMany({
    where: { id: { in: Object.values(fixture.vehicles) } },
    data: { recordStatus: 'INACTIVE' },
  });
  await app.close();
});

/** An accepted referral with a confirmed trip on the given vehicle and crew. */
async function confirmedTrip(registration: string, crew: string[]) {
  const created = await clinician.post('/api/referrals').send({
    referringInstitutionId: ids.north,
    patient: {
      fullName: 'Chebet Langat',
      sex: 'FEMALE',
      estimatedAge: 34,
      estimatedAgeUnit: 'YEARS',
    },
    pregnancyStatus: 'NOT_PREGNANT',
    reason: 'Open fracture of the tibia; needs orthopaedic surgery.',
    clinicalSummary: 'Fell from a ladder. Splinted, IV antibiotics given.',
    urgency: 'URGENT',
  });
  const referralId = created.body.id as string;
  await clinician
    .post(`/api/referrals/${referralId}/submit`)
    .send({ institutionIds: [ids.east] })
    .expect(204);
  const referral = await clinician.get(`/api/referrals/${referralId}`);
  await east
    .post(`/api/referral-requests/${referral.body.requests[0].id}/respond`)
    .send({ decision: 'ACCEPT' })
    .expect(204);
  const transfer = await clinician
    .post(`/api/referrals/${referralId}/transfer`)
    .send({ requiredCapability: 'BLS', notes: 'Splint on the left leg.' });
  const transferId = transfer.body.id as string;
  const offer = await clinician
    .post(`/api/transfers/${transferId}/offers`)
    .send({ vehicleId: fixture.vehicles[registration] });
  expect(offer.status, JSON.stringify(offer.body)).toBe(201);
  const assignmentId = offer.body.id as string;
  await dispatcher
    .post(`/api/dispatch-assignments/${assignmentId}/confirm`)
    .send({
      vehicleId: fixture.vehicles[registration],
      crewMemberIds: crew.map((k) => fixture.crew[k]),
    })
    .expect(204);
  return { transferId, assignmentId };
}

const detail = async (transferId: string) =>
  (await clinician.get(`/api/transfers/${transferId}`)).body as TransferDetail;

describe('crew app sign-in', () => {
  it('returns tokens in the body instead of cookies', async () => {
    const res = await http()
      .post('/api/auth/login')
      .set('X-Lifeline-Client', 'mobile')
      .send({ email: 'crew.a@demo.lifeline.test', password: TEST_PASSWORD });
    expect(res.body.tokens).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      accessExpiresInSeconds: 900,
    });
    expect(cookieFrom(res, 'll_at')).toBeUndefined();
  });

  it('rotates the refresh token, and treats reuse of an old one as theft', async () => {
    const first = await mobileSignIn('crew.a@demo.lifeline.test');
    const rotated = await http()
      .post('/api/auth/mobile/refresh')
      .send({ refreshToken: first.refreshToken });
    expect(rotated.status).toBe(200);
    expect(rotated.body.refreshToken).not.toBe(first.refreshToken);
    await http()
      .get('/api/crew/trips')
      .set('Authorization', `Bearer ${rotated.body.accessToken}`)
      .expect(200);

    // Pretend the grace window has passed, then present the old token again.
    await prismaOf(app).session.updateMany({
      where: { previousRefreshHash: { not: null }, user: { email: 'crew.a@demo.lifeline.test' } },
      data: { rotatedAt: new Date(Date.now() - 5 * 60_000) },
    });
    await http()
      .post('/api/auth/mobile/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);
    await http()
      .get('/api/crew/trips')
      .set('Authorization', `Bearer ${rotated.body.accessToken}`)
      .expect(401);
  });

  it('is only for crew', async () => {
    await clinician.get('/api/crew/trips').expect(403);
  });
});

describe('status updates sync correctly after an offline period (Phase 4 done-when)', () => {
  let trip: { transferId: string; assignmentId: string };
  let batch: Record<string, unknown>;

  it('shows the crew their trip with what they need to know', async () => {
    trip = await confirmedTrip('KDT 401A', ['A', 'D']);
    const list = await trips(crewA);
    const mine = list.find((t) => t.assignmentId === trip.assignmentId)!;
    expect(mine).toMatchObject({
      status: 'AMBULANCE_ASSIGNED',
      nextStatus: 'DISPATCHED',
      patient: { displayName: 'Chebet Langat' },
      pickup: { id: ids.north },
      destination: { id: ids.east },
      notes: 'Splint on the left leg.',
      vehicle: { registration: 'KDT 401A' },
    });
    expect(mine.crew.map((c) => c.fullName).sort()).toEqual([
      'Fixture Driver D',
      'Fixture Paramedic A',
    ]);
    // Not on this crew, so not in their list.
    expect((await trips(crewB)).some((t) => t.assignmentId === trip.assignmentId)).toBe(false);
  });

  it('applies a whole journey recorded offline, in order, at the times it happened', async () => {
    // The trip was confirmed before the crew lost signal 40 minutes ago.
    await prismaOf(app).dispatchAssignment.update({
      where: { id: trip.assignmentId },
      data: { respondedAt: new Date(Date.now() - 45 * 60_000) },
    });
    // While the crew had no signal, the dispatcher recorded the departure by radio.
    await dispatcher.post(`/api/dispatch-assignments/${trip.assignmentId}/dispatch`).expect(204);

    const a = trip.assignmentId;
    const statusUpdates = [
      press(a, 'DISPATCHED', 40),
      press(a, 'AT_PICKUP', 30),
      press(a, 'PATIENT_COLLECTED', 22),
      press(a, 'IN_TRANSIT', 20),
      press(a, 'INTERRUPTED', 12, 'Flat tyre, changing it'),
      press(a, 'IN_TRANSIT', 6),
      press(a, 'ARRIVED', 1),
    ];
    const locations = Array.from({ length: 40 }, (_, i) => ({
      assignmentId: a,
      recordedAt: new Date(Date.now() - (40 - i) * 60_000).toISOString(),
      latitude: -1.005 - i * 0.012,
      longitude: 36.903 + i * 0.009,
      accuracy: 12,
    }));
    batch = { statusUpdates, locations };
    const result = await sync(crewA, batch);

    expect(result.statusResults.map((r) => r.outcome)).toEqual([
      'ALREADY_RECORDED',
      'APPLIED',
      'APPLIED',
      'APPLIED',
      'APPLIED',
      'APPLIED',
      'APPLIED',
    ]);
    expect(result.locationsAccepted).toBe(40);
    expect(result.trips.find((t) => t.assignmentId === a)).toMatchObject({
      status: 'ARRIVED',
      nextStatus: null,
    });

    const view = await detail(trip.transferId);
    expect(view.status).toBe('ARRIVED');
    expect(view.atPickupAt).toBe(statusUpdates[1]!.occurredAt);
    expect(view.arrivedAt).toBe(statusUpdates[6]!.occurredAt);
    const crewEvents = view.events.filter((e) => e.source === 'CREW_APP');
    expect(crewEvents.map((e) => e.type)).toEqual([
      'AT_PICKUP',
      'PATIENT_COLLECTED',
      'IN_TRANSIT',
      'INTERRUPTED',
      'RESUMED',
      'ARRIVED',
    ]);
    // Times are the device's; the server records when it actually heard about them.
    const pickup = crewEvents[0]!;
    expect(pickup.occurredAt).toBe(statusUpdates[1]!.occurredAt);
    expect(
      new Date(pickup.receivedAt).getTime() - new Date(pickup.occurredAt).getTime(),
    ).toBeGreaterThan(29 * 60_000);
    expect(crewEvents[3]!.note).toBe('Flat tyre, changing it');
    const destinationNotifications = (
      await east.get('/api/notifications').query({ networkId: ids.networkId })
    ).body as { eventType: string; entityId: string }[];
    expect(
      destinationNotifications.some(
        (notification) =>
          notification.eventType === 'TRANSFER_ARRIVED' &&
          notification.entityId === trip.transferId,
      ),
    ).toBe(true);
  });

  it('records nothing twice when the app retries after losing the response', async () => {
    const retry = await sync(crewA, batch);
    expect(retry.statusResults.map((r) => r.outcome)).toEqual([
      'ALREADY_RECORDED',
      'DUPLICATE',
      'DUPLICATE',
      'DUPLICATE',
      'DUPLICATE',
      'DUPLICATE',
      'DUPLICATE',
    ]);
    expect(retry.locationsAccepted).toBe(0);
    const view = await detail(trip.transferId);
    expect(view.events.filter((e) => e.source === 'CREW_APP')).toHaveLength(6);
    expect(
      await prismaOf(app).locationPing.count({ where: { assignmentId: trip.assignmentId } }),
    ).toBe(40);
  });

  it('moves the vehicle’s last known position to the latest fix', async () => {
    const vehicle = await prismaOf(app).vehicle.findUniqueOrThrow({
      where: { id: fixture.vehicles['KDT 401A'] },
    });
    expect(vehicle.lastLatitude).toBeCloseTo(-1.005 - 39 * 0.012);
    expect(vehicle.lastLocationAt!.getTime()).toBeGreaterThan(Date.now() - 2 * 60_000);
  });

  it('audits each update with how late it arrived', async () => {
    const audit = await prismaOf(app).auditEvent.findMany({
      where: { entityId: trip.transferId, action: 'transfer.crew_status_updated' },
    });
    expect(audit).toHaveLength(6);
    expect(
      Math.max(...audit.map((a) => (a.metadata as { delaySeconds: number }).delaySeconds)),
    ).toBeGreaterThan(29 * 60);
  });
});

describe('conflicts found when the queue reaches the server', () => {
  it('rejects updates from crew taken off the trip while offline', async () => {
    const trip = await confirmedTrip('KDT 402B', ['B']);
    const first = await sync(crewB, { statusUpdates: [press(trip.assignmentId, 'DISPATCHED', 3)] });
    expect(first.statusResults[0]!.outcome).toBe('APPLIED');

    await dispatcher
      .post(`/api/dispatch-assignments/${trip.assignmentId}/reassign`)
      .send({
        vehicleId: fixture.vehicles['KDT 402B'],
        crewMemberIds: [fixture.crew.E],
        reason: 'EMT B called to another emergency',
      })
      .expect(204);
    const late = await sync(crewB, { statusUpdates: [press(trip.assignmentId, 'AT_PICKUP', 1)] });
    expect(late.statusResults[0]).toMatchObject({ outcome: 'REJECTED', reason: 'NOT_ON_TRIP' });
    expect(late.trips.some((t) => t.assignmentId === trip.assignmentId)).toBe(false);
    expect((await detail(trip.transferId)).status).toBe('DISPATCHED');

    await dispatcher
      .post(`/api/dispatch-assignments/${trip.assignmentId}/release`)
      .send({ reason: 'Test finished' })
      .expect(204);
  });

  it('rejects updates to a trip released while offline, and steps out of order', async () => {
    const trip = await confirmedTrip('KDT 402B', ['B']);
    const skipped = await sync(crewB, {
      statusUpdates: [press(trip.assignmentId, 'AT_PICKUP', 2)],
    });
    expect(skipped.statusResults[0]).toMatchObject({
      outcome: 'REJECTED',
      reason: 'INVALID_TRANSITION',
      message: 'This trip is now “Ambulance assigned”, so “At pickup” can’t be recorded.',
    });

    await dispatcher
      .post(`/api/dispatch-assignments/${trip.assignmentId}/release`)
      .send({ reason: 'Gearbox fault' })
      .expect(204);
    const late = await sync(crewB, { statusUpdates: [press(trip.assignmentId, 'DISPATCHED', 1)] });
    expect(late.statusResults[0]).toMatchObject({
      outcome: 'REJECTED',
      reason: 'TRIP_ENDED',
      message: 'Your provider released this trip.',
    });
    expect((await detail(trip.transferId)).status).toBe('AWAITING_TRANSPORT');
  });

  it('uses the time received when the device clock is far ahead', async () => {
    const trip = await confirmedTrip('KDT 402B', ['B']);
    const ahead = new Date(Date.now() + 3 * 60 * 60_000).toISOString();
    await sync(crewB, {
      statusUpdates: [{ ...press(trip.assignmentId, 'DISPATCHED', 0), occurredAt: ahead }],
    });
    const view = await detail(trip.transferId);
    expect(new Date(view.dispatchedAt!).getTime()).toBeLessThanOrEqual(Date.now());
    await dispatcher
      .post(`/api/dispatch-assignments/${trip.assignmentId}/release`)
      .send({ reason: 'Test finished' })
      .expect(204);
  });

  it('needs a note to report a problem', async () => {
    const res = await http()
      .post('/api/crew/sync')
      .set('Authorization', `Bearer ${crewB}`)
      .send({ statusUpdates: [{ ...press('x', 'INTERRUPTED', 0) }] });
    expect(res.status).toBe(400);
  });

  it('accepts a long offline stretch of positions in one upload', async () => {
    const locations = Array.from({ length: 500 }, (_, i) => ({
      assignmentId: 'unknown-assignment',
      recordedAt: new Date(Date.now() - i * 5_000).toISOString(),
      latitude: -1.2,
      longitude: 36.8,
      accuracy: 25.5,
      speed: 12.3,
      heading: 180,
    }));
    const result = await sync(crewB, { locations });
    // Positions for trips they aren't on are ignored, not stored.
    expect(result.locationsAccepted).toBe(0);
  });
});
