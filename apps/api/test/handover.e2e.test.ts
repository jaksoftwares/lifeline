import { randomUUID } from 'node:crypto';
import { type AddressInfo } from 'node:net';
import { type INestApplication } from '@nestjs/common';
import { type TransferDetail } from '@lifeline/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/passwords';
import { bearerToken, createApp, demoIds, prismaOf, signIn, type Agent } from './helpers';
import { TEST_PASSWORD } from './test-env';

let app: INestApplication;
let base: string;
let ids: Awaited<ReturnType<typeof demoIds>>;
let clinician: Agent;
let receiving: Agent;
let unrelatedFacility: Agent;
let dispatcher: Agent;
let crewToken: string;
let transferId: string;
let assignmentId: string;
let vehicleId: string;

const checklist = {
  patientIdentityConfirmed: true,
  clinicalSummaryReceived: true,
  latestObservationsReceived: true,
  treatmentAndAllergiesReviewed: true,
  documentsAndResultsAddressed: true,
};

beforeAll(async () => {
  app = await createApp();
  await app.listen(0);
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  ids = await demoIds(app);
  clinician = (await signIn(app, 'clinician.north@demo.lifeline.test')).agent;
  receiving = (await signIn(app, 'receiving.east@demo.lifeline.test')).agent;
  unrelatedFacility = (await signIn(app, 'receiving.west@demo.lifeline.test')).agent;
  dispatcher = (await signIn(app, 'dispatcher@demo.lifeline.test')).agent;

  const prisma = prismaOf(app);
  const fixtureId = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `crew.phase6.${fixtureId}@demo.lifeline.test`,
      fullName: 'Phase Six Crew',
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
  const crewMember = await prisma.crewMember.create({
    data: {
      institutionId: ids.ambulance,
      fullName: 'Phase Six Crew',
      qualification: 'EMT',
      userId: user.id,
    },
  });
  crewToken = await bearerToken(app, user.email);
  vehicleId = (
    await prisma.vehicle.create({
      data: {
        networkId: ids.networkId,
        institutionId: ids.ambulance,
        registration: `P6 ${fixtureId.toUpperCase()}`,
        capability: 'ALS',
        equipment: [],
        status: 'AVAILABLE',
        statusUpdatedAt: new Date(),
        baseLatitude: -1.1,
        baseLongitude: 36.9,
      },
    })
  ).id;

  const created = await clinician.post('/api/referrals').send({
    referringInstitutionId: ids.north,
    patient: { fullName: 'Phase Six Patient', sex: 'FEMALE' },
    reason: 'Requires transfer for specialist care.',
    clinicalSummary: 'Stable for transfer; receiving team was contacted.',
    urgency: 'URGENT',
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  await clinician
    .post(`/api/referrals/${created.body.id}/submit`)
    .send({ institutionIds: [ids.east] })
    .expect(204);
  const referral = await clinician.get(`/api/referrals/${created.body.id}`);
  await receiving
    .post(`/api/referral-requests/${referral.body.requests[0].id}/respond`)
    .send({ decision: 'ACCEPT' })
    .expect(204);
  const transfer = await clinician
    .post(`/api/referrals/${created.body.id}/transfer`)
    .send({ requiredCapability: 'ALS' });
  expect(transfer.status, JSON.stringify(transfer.body)).toBe(201);
  transferId = transfer.body.id as string;
  const offered = await clinician.post(`/api/transfers/${transferId}/offers`).send({ vehicleId });
  expect(offered.status, JSON.stringify(offered.body)).toBe(201);
  assignmentId = offered.body.id as string;
  await dispatcher
    .post(`/api/dispatch-assignments/${assignmentId}/confirm`)
    .send({ vehicleId, crewMemberIds: [crewMember.id] })
    .expect(204);
});

afterAll(async () => {
  if (app) {
    await prismaOf(app).vehicle.update({
      where: { id: vehicleId },
      data: { recordStatus: 'INACTIVE' },
    });
    await app.close();
  }
});

describe('handover and cost (Phase 6 done-when)', () => {
  it('requires arrival, an authorised receiving signatory and a complete checklist', async () => {
    const detail = await receiving.get(`/api/transfers/${transferId}`);
    expect(detail.body.status).toBe('AMBULANCE_ASSIGNED');
    await receiving.post(`/api/transfers/${transferId}/handover`).send(checklist).expect(409);

    await dispatcher.post(`/api/dispatch-assignments/${assignmentId}/dispatch`).expect(204);
    const sync = await fetch(`${base}/api/crew/sync`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${crewToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        statusUpdates: ['AT_PICKUP', 'PATIENT_COLLECTED', 'IN_TRANSIT', 'ARRIVED'].map(
          (status) => ({
            clientId: randomUUID(),
            assignmentId,
            status,
            occurredAt: new Date().toISOString(),
          }),
        ),
        locations: [],
      }),
    });
    expect(sync.status).toBe(200);
    const syncBody = (await sync.json()) as { statusResults: { outcome: string }[] };
    expect(syncBody.statusResults.every((result) => result.outcome === 'APPLIED')).toBe(true);
    expect((await receiving.get(`/api/transfers/${transferId}`)).body.status).toBe('ARRIVED');

    await unrelatedFacility
      .post(`/api/transfers/${transferId}/handover`)
      .send(checklist)
      .expect(404);
    await dispatcher.post(`/api/transfers/${transferId}/handover`).send(checklist).expect(403);
    await receiving
      .post(`/api/transfers/${transferId}/handover`)
      .send({ ...checklist, treatmentAndAllergiesReviewed: false })
      .expect(400);

    await receiving
      .post(`/api/transfers/${transferId}/handover`)
      .send({ ...checklist, notes: 'Receiving team briefed at bedside.' })
      .expect(204);
    await receiving.post(`/api/transfers/${transferId}/handover`).send(checklist).expect(409);

    const signed = (await receiving.get(`/api/transfers/${transferId}`)).body as TransferDetail;
    expect(signed).toMatchObject({
      status: 'HANDED_OVER',
      handover: {
        ...checklist,
        notes: 'Receiving team briefed at bedside.',
        signedBy: { fullName: 'Dr. Ann Mwikali' },
      },
      viewer: { canSignHandover: true, canComplete: true },
    });
    expect(signed.handedOverAt).not.toBeNull();
  });

  it('requires a one-time cost record before completion and releases the vehicle', async () => {
    await receiving.post(`/api/transfers/${transferId}/complete`).expect(409);
    await unrelatedFacility
      .post(`/api/transfers/${transferId}/cost`)
      .send({ amount: '12500.50', payer: 'COUNTY_GOVERNMENT' })
      .expect(404);

    await dispatcher
      .post(`/api/transfers/${transferId}/cost`)
      .send({ amount: '12500.50', payer: 'COUNTY_GOVERNMENT', notes: 'Trip invoice 1042' })
      .expect(204);
    await dispatcher
      .post(`/api/transfers/${transferId}/cost`)
      .send({ amount: '12500.50', payer: 'COUNTY_GOVERNMENT' })
      .expect(409);
    await receiving.post(`/api/transfers/${transferId}/complete`).expect(204);
    await receiving.post(`/api/transfers/${transferId}/complete`).expect(409);

    const completed = (await receiving.get(`/api/transfers/${transferId}`)).body as TransferDetail;
    expect(completed).toMatchObject({
      status: 'COMPLETED',
      cost: {
        amount: 12500.5,
        currency: 'KES',
        payer: 'COUNTY_GOVERNMENT',
        notes: 'Trip invoice 1042',
      },
      current: null,
    });
    expect(completed.completedAt).not.toBeNull();
    const prisma = prismaOf(app);
    expect(
      (await prisma.dispatchAssignment.findUniqueOrThrow({ where: { id: assignmentId } })).status,
    ).toBe('COMPLETED');
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })).recordStatus,
    ).toBe('ACTIVE');
    expect(
      await prisma.dispatchAssignment.count({ where: { vehicleId, status: 'CONFIRMED' } }),
    ).toBe(0);
    const events = await prisma.transferEvent.findMany({
      where: { transferId },
      select: { type: true },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((event) => event.type)).toContain('HANDED_OVER');
    expect(events.map((event) => event.type)).toContain('COST_RECORDED');
    expect(events.map((event) => event.type)).toContain('COMPLETED');
    const auditActions = await prisma.auditEvent.findMany({
      where: { entityId: transferId },
      select: { action: true },
    });
    expect(auditActions.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'transfer.handover_signed',
        'transfer.cost_recorded',
        'transfer.completed',
      ]),
    );
    await expect(
      prisma.handover.update({
        where: { transferId },
        data: { notes: 'Attempt to alter signed handover' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.transferCost.update({
        where: { transferId },
        data: { notes: 'Attempt to alter recorded cost' },
      }),
    ).rejects.toThrow();
  });
});
