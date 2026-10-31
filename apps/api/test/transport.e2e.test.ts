import { type INestApplication } from '@nestjs/common';
import {
  type CrewListResponse,
  type SuggestionsResponse,
  type TransferDetail,
  type TransferSummary,
  type VehicleView,
} from '@lifeline/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Agent, createApp, demoIds, prismaOf, signIn } from './helpers';

let app: INestApplication;
let ids: Awaited<ReturnType<typeof demoIds>>;
let clinician: Agent;
let east: Agent;
let west: Agent;
let dispatcher: Agent;
let countyDispatcher: Agent;
let operations: Agent;
let providerAdmin: Agent;
let vehicle: (registration: string) => string;
let crew: (name: string) => string;

beforeAll(async () => {
  app = await createApp();
  ids = await demoIds(app);
  clinician = (await signIn(app, 'clinician.north@demo.lifeline.test')).agent;
  east = (await signIn(app, 'receiving.east@demo.lifeline.test')).agent;
  west = (await signIn(app, 'receiving.west@demo.lifeline.test')).agent;
  dispatcher = (await signIn(app, 'dispatcher@demo.lifeline.test')).agent;
  countyDispatcher = (await signIn(app, 'dispatcher.county@demo.lifeline.test')).agent;
  operations = (await signIn(app, 'operations@demo.lifeline.test')).agent;
  providerAdmin = (await signIn(app, 'admin.ambulance@demo.lifeline.test')).agent;

  const prisma = prismaOf(app);
  const vehicles = await prisma.vehicle.findMany({ where: { networkId: ids.networkId } });
  vehicle = (registration) => vehicles.find((v) => v.registration === registration)!.id;
  const members = await prisma.crewMember.findMany();
  crew = (name) => members.find((c) => c.fullName === name)!.id;
});

afterAll(async () => {
  await app.close();
});

/** A referral from North that the East hospital has accepted. */
async function acceptedReferral(urgency = 'URGENT'): Promise<string> {
  const created = await clinician.post('/api/referrals').send({
    referringInstitutionId: ids.north,
    patient: {
      fullName: 'Otieno Barasa',
      sex: 'MALE',
      estimatedAge: 58,
      estimatedAgeUnit: 'YEARS',
    },
    pregnancyStatus: 'NOT_APPLICABLE',
    reason: 'Acute coronary syndrome; needs a cardiac catheterisation lab.',
    clinicalSummary: 'Central chest pain for 2 hours, ST elevation in the inferior leads.',
    urgency,
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const referralId = created.body.id as string;
  await clinician
    .post(`/api/referrals/${referralId}/submit`)
    .send({ institutionIds: [ids.east] })
    .expect(204);
  const view = await clinician.get(`/api/referrals/${referralId}`);
  await east
    .post(`/api/referral-requests/${view.body.requests[0].id}/respond`)
    .send({ decision: 'ACCEPT' })
    .expect(204);
  return referralId;
}

async function requestTransport(
  referralId: string,
  need: Record<string, unknown> = { requiredCapability: 'BLS' },
): Promise<string> {
  const res = await clinician.post(`/api/referrals/${referralId}/transfer`).send(need);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

const transfer = async (agent: Agent, id: string) => {
  const res = await agent.get(`/api/transfers/${id}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as TransferDetail;
};

const suggestions = async (agent: Agent, id: string) => {
  const res = await agent.get(`/api/transfers/${id}/suggestions`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as SuggestionsResponse;
};

const list = async (agent: Agent, box: string, open = true) => {
  const res = await agent
    .get('/api/transfers')
    .query({ networkId: ids.networkId, box, open: String(open) });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as TransferSummary[];
};

const offer = (agent: Agent, transferId: string, registration: string) =>
  agent.post(`/api/transfers/${transferId}/offers`).send({ vehicleId: vehicle(registration) });

describe('a dispatcher assigns and the provider confirms a suitable vehicle (Phase 3 done-when)', () => {
  let referralId: string;
  let transferId: string;
  let assignmentId: string;

  it('lets the referring facility request transport once the referral is accepted', async () => {
    referralId = await acceptedReferral('EMERGENCY');
    const referral = await clinician.get(`/api/referrals/${referralId}`);
    expect(referral.body.transferId).toBeNull();
    expect(referral.body.viewer.canArrangeTransport).toBe(true);

    transferId = await requestTransport(referralId, {
      requiredCapability: 'ALS',
      requiredEquipment: ['OXYGEN', 'CARDIAC_MONITOR'],
      notes: 'On 4 L oxygen. Aspirin given.',
    });
    expect((await clinician.get(`/api/referrals/${referralId}`)).body.transferId).toBe(transferId);
    const view = await transfer(clinician, transferId);
    expect(view).toMatchObject({
      status: 'AWAITING_TRANSPORT',
      pickup: { id: ids.north },
      destination: { id: ids.east },
      requiredCapability: 'ALS',
      current: null,
      viewer: { canArrange: true },
    });
    expect(view.tripMinutes).toBeGreaterThan(0);
  });

  it('suggests suitable vehicles nearest first, and explains every exclusion', async () => {
    const result = await suggestions(clinician, transferId);
    expect(result.suggestions.map((s) => s.vehicle.registration)).toEqual(['KDA 101A', 'KDA 102B']);
    const [first, second] = result.suggestions;
    expect(first!.reasons[0]).toBe('Advanced life support, as needed');
    expect(first!.etaMinutes).toBeLessThan(second!.etaMinutes!);
    expect(second!.cautions).toContain('Higher level than needed');

    const why = Object.fromEntries(
      result.excluded.map((e) => [e.vehicle.registration, e.reasons.join('; ')]),
    );
    expect(why['KDA 103C']).toMatch(/^Out of service/);
    expect(why['KDA 104D']).toMatch(/^Availability last confirmed 16 h ago/);
    expect(why['GKB 201A']).toBe('Basic life support only; No cardiac monitor');
    expect(why['GKB 203C']).toMatch(/^Off duty/);
  });

  it('refuses to offer a vehicle that can’t do the job', async () => {
    const res = await offer(clinician, transferId, 'GKB 202B');
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/patient transport only/);
  });

  it('offers the transfer to the chosen vehicle; nothing is assigned yet', async () => {
    const res = await offer(clinician, transferId, 'KDA 101A');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    assignmentId = res.body.id;
    const view = await transfer(clinician, transferId);
    expect(view.status).toBe('AWAITING_TRANSPORT');
    expect(view.current).toMatchObject({ status: 'PROPOSED', provider: { id: ids.ambulance } });

    // Offers go to one provider at a time.
    expect((await offer(clinician, transferId, 'KDA 102B')).status).toBe(409);
  });

  it('puts the offer in the provider’s dispatch list without the patient’s name', async () => {
    const inbox = await list(dispatcher, 'provider');
    const item = inbox.find((t) => t.id === transferId)!;
    expect(item).toMatchObject({ nextAction: 'Confirm or decline', patient: null });

    const view = await transfer(dispatcher, transferId);
    expect(view.patient).toBeNull();
    expect(view.notes).toBe('On 4 L oxygen. Aspirin given.');
    expect(view.viewer).toMatchObject({
      canArrange: false,
      canViewReferral: false,
      dispatchableAssignmentIds: [assignmentId],
    });
    // The provider can't open the referral itself.
    await dispatcher.get(`/api/referrals/${referralId}`).expect(404);
  });

  it('keeps other providers and unrelated facilities out', async () => {
    await countyDispatcher.get(`/api/transfers/${transferId}`).expect(404);
    await countyDispatcher
      .post(`/api/dispatch-assignments/${assignmentId}/confirm`)
      .send({ vehicleId: vehicle('GKB 201A'), crewMemberIds: [crew('Agnes Moraa')] })
      .expect(404);
    await west.get(`/api/transfers/${transferId}`).expect(404);
  });

  it('lets the receiving facility follow the transfer but not arrange it', async () => {
    const view = await transfer(east, transferId);
    expect(view.viewer.canArrange).toBe(false);
    expect(view.patient?.displayName).toBe('Otieno Barasa');
    expect((await offer(east, transferId, 'KDA 102B')).status).toBe(403);
  });

  it('refuses crew from another provider', async () => {
    const res = await dispatcher
      .post(`/api/dispatch-assignments/${assignmentId}/confirm`)
      .send({ vehicleId: vehicle('KDA 101A'), crewMemberIds: [crew('Agnes Moraa')] });
    expect(res.status).toBe(400);
  });

  it('is assigned when the provider confirms the vehicle and crew', async () => {
    await dispatcher
      .post(`/api/dispatch-assignments/${assignmentId}/confirm`)
      .send({
        vehicleId: vehicle('KDA 101A'),
        crewMemberIds: [crew('Kevin Ochieng'), crew('Ali Hassan')],
        etaMinutes: 18,
      })
      .expect(204);

    const view = await transfer(clinician, transferId);
    expect(view.status).toBe('AMBULANCE_ASSIGNED');
    expect(view.assignedAt).not.toBeNull();
    expect(view.current).toMatchObject({
      status: 'CONFIRMED',
      etaMinutes: 18,
      vehicle: { registration: 'KDA 101A', capability: 'ALS' },
    });
    expect(view.current!.crew.map((c) => c.fullName).sort()).toEqual([
      'Ali Hassan',
      'Kevin Ochieng',
    ]);
    // Once they've confirmed, the crew need to know whom they're collecting.
    expect((await transfer(dispatcher, transferId)).patient?.displayName).toBe('Otieno Barasa');
  });

  it('marks the vehicle as on this transfer', async () => {
    const res = await dispatcher.get(`/api/networks/${ids.networkId}/vehicles`);
    const das1 = (res.body as VehicleView[]).find((v) => v.registration === 'KDA 101A')!;
    expect(das1.onTransfer?.id).toBe(transferId);
  });

  it('is dispatched by the provider, with the whole history recorded', async () => {
    await dispatcher.post(`/api/dispatch-assignments/${assignmentId}/dispatch`).expect(204);
    await dispatcher.post(`/api/dispatch-assignments/${assignmentId}/dispatch`).expect(409);
    const view = await transfer(clinician, transferId);
    expect(view.status).toBe('DISPATCHED');
    expect(view.events.map((e) => e.type)).toEqual([
      'REQUESTED',
      'OFFERED',
      'CONFIRMED',
      'DISPATCHED',
    ]);
    expect(view.events.find((e) => e.type === 'CONFIRMED')?.note).toContain('About 18 min');

    const audit = await prismaOf(app).auditEvent.findMany({
      where: { entityId: transferId, action: { startsWith: 'transfer.' } },
    });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'transfer.requested',
        'transfer.offered',
        'transfer.confirmed',
        'transfer.dispatched',
      ]),
    );
  });

  it('refuses a second transfer for the same referral', async () => {
    const res = await clinician
      .post(`/api/referrals/${referralId}/transfer`)
      .send({ requiredCapability: 'BLS' });
    expect(res.status).toBe(409);
  });
});

describe('when the provider can’t do it', () => {
  let transferId: string;

  it('goes back to the arranger when the provider declines', async () => {
    transferId = await requestTransport(await acceptedReferral());
    const first = await suggestions(clinician, transferId);
    expect(first.suggestions[0]!.vehicle.registration).toBe('GKB 201A');
    expect(first.excluded.find((e) => e.vehicle.registration === 'KDA 101A')?.reasons).toEqual([
      'On another transfer',
    ]);

    const offered = await offer(clinician, transferId, 'GKB 201A');
    await countyDispatcher
      .post(`/api/dispatch-assignments/${offered.body.id}/decline`)
      .send({ reason: 'NO_CREW' })
      .expect(204);

    const view = await transfer(clinician, transferId);
    expect(view).toMatchObject({ status: 'AWAITING_TRANSPORT', current: null });
    const item = (await list(clinician, 'facility')).find((t) => t.id === transferId)!;
    expect(item.attention).toBe('Declined by Demo County Ambulance Service: no crew available');
    expect(item.nextAction).toBe('Offer a vehicle');
    const again = await suggestions(clinician, transferId);
    expect(
      again.suggestions.find((s) => s.vehicle.registration === 'GKB 201A')?.cautions,
    ).toContain('Declined this transfer earlier');
  });

  it('won’t put the same crew member on two trips', async () => {
    const offered = await offer(clinician, transferId, 'KDA 102B');
    const res = await dispatcher
      .post(`/api/dispatch-assignments/${offered.body.id}/confirm`)
      .send({ vehicleId: vehicle('KDA 102B'), crewMemberIds: [crew('Kevin Ochieng')] });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Kevin Ochieng is already on another transfer.');
  });

  it('lets the dispatcher swap the vehicle and crew after confirming', async () => {
    const view = await transfer(dispatcher, transferId);
    const assignmentId = view.current!.id;
    await dispatcher
      .post(`/api/dispatch-assignments/${assignmentId}/confirm`)
      .send({ vehicleId: vehicle('KDA 102B'), crewMemberIds: [crew('Mary Atieno')] })
      .expect(204);
    await dispatcher.post(`/api/dispatch-assignments/${assignmentId}/dispatch`).expect(204);

    // Out-of-date availability doesn't stop the dispatcher: choosing the vehicle confirms it.
    await dispatcher
      .post(`/api/dispatch-assignments/${assignmentId}/reassign`)
      .send({
        vehicleId: vehicle('KDA 104D'),
        crewMemberIds: [crew('Mary Atieno'), crew('John Mutiso')],
        reason: 'DAS-2 needed for a ventilated patient',
      })
      .expect(204);
    const after = await transfer(clinician, transferId);
    expect(after.status).toBe('AMBULANCE_ASSIGNED');
    expect(after.current?.vehicle?.registration).toBe('KDA 104D');
    expect(after.current?.crew).toHaveLength(2);
    expect(after.events.at(-1)).toMatchObject({
      type: 'REASSIGNED',
      note: 'Vehicle changed from KDA 102B to KDA 104D. DAS-2 needed for a ventilated patient',
    });
  });

  it('returns to awaiting transport when the provider releases the trip', async () => {
    const assignmentId = (await transfer(dispatcher, transferId)).current!.id;
    await dispatcher
      .post(`/api/dispatch-assignments/${assignmentId}/release`)
      .send({ reason: 'Vehicle broke down at the depot' })
      .expect(204);
    const view = await transfer(clinician, transferId);
    expect(view).toMatchObject({ status: 'AWAITING_TRANSPORT', current: null, assignedAt: null });
    expect(view.assignments.map((a) => a.status)).toEqual(['DECLINED', 'RELEASED']);
  });

  it('lets the arranger withdraw an offer that isn’t answered', async () => {
    const offered = await offer(clinician, transferId, 'GKB 201A');
    await clinician
      .post(`/api/dispatch-assignments/${offered.body.id}/withdraw`)
      .send({ reason: 'No answer after 15 minutes' })
      .expect(204);
    await countyDispatcher
      .post(`/api/dispatch-assignments/${offered.body.id}/confirm`)
      .send({ vehicleId: vehicle('GKB 201A'), crewMemberIds: [crew('Agnes Moraa')] })
      .expect(409);
  });

  it('records transport arranged outside Lifeline', async () => {
    const res = await clinician.post(`/api/transfers/${transferId}/external`).send({
      service: 'NATIONAL_922',
      vehicleRegistration: 'GK 922X',
      contactPhone: '+254700000922',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const view = await transfer(clinician, transferId);
    expect(view.status).toBe('AMBULANCE_ASSIGNED');
    expect(view.current).toMatchObject({
      kind: 'EXTERNAL',
      external: { service: 'NATIONAL_922', vehicleRegistration: 'GK 922X' },
    });
    // With no provider on Lifeline, the arranger records the departure.
    await clinician.post(`/api/dispatch-assignments/${res.body.id}/dispatch`).expect(204);
    expect((await transfer(clinician, transferId)).status).toBe('DISPATCHED');
  });
});

describe('safeguards', () => {
  it('needs an accepted referral', async () => {
    const draft = await clinician.post('/api/referrals').send({
      referringInstitutionId: ids.north,
      patient: { sex: 'UNKNOWN' },
    });
    const res = await clinician
      .post(`/api/referrals/${draft.body.id}/transfer`)
      .send({ requiredCapability: 'BLS' });
    expect(res.status).toBe(409);
  });

  it('never confirms one vehicle for two transfers', async () => {
    const a = await requestTransport(await acceptedReferral(), { requiredCapability: 'ALS' });
    const b = await requestTransport(await acceptedReferral(), { requiredCapability: 'ALS' });
    const offerA = await offer(clinician, a, 'KDA 102B');
    const second = await suggestions(clinician, b);
    expect(
      second.suggestions.find((s) => s.vehicle.registration === 'KDA 102B')?.cautions,
    ).toContain('Already offered for another transfer');
    const offerB = await offer(clinician, b, 'KDA 102B');

    await dispatcher
      .post(`/api/dispatch-assignments/${offerA.body.id}/confirm`)
      .send({ vehicleId: vehicle('KDA 102B'), crewMemberIds: [crew('James Kibet')] })
      .expect(204);
    const res = await dispatcher
      .post(`/api/dispatch-assignments/${offerB.body.id}/confirm`)
      .send({ vehicleId: vehicle('KDA 102B'), crewMemberIds: [crew('John Mutiso')] });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/on another transfer/);

    // Clean up so later tests have the vehicle again.
    await clinician
      .post(`/api/transfers/${a}/cancel`)
      .send({ reason: 'Test finished' })
      .expect(204);
    await clinician
      .post(`/api/transfers/${b}/cancel`)
      .send({ reason: 'Test finished' })
      .expect(204);
  });

  it('is backed by the database, even if two requests race past the service checks', async () => {
    const prisma = prismaOf(app);
    const a = await requestTransport(await acceptedReferral());
    const b = await requestTransport(await acceptedReferral());
    const proposer = await prisma.user.findUniqueOrThrow({
      where: { email: 'clinician.north@demo.lifeline.test' },
    });
    const confirmed = (transferId: string) => ({
      transferId,
      kind: 'PROVIDER' as const,
      status: 'CONFIRMED' as const,
      providerId: ids.ambulance,
      vehicleId: vehicle('KDA 102B'),
      proposedById: proposer.id,
    });

    const first = await prisma.dispatchAssignment.create({ data: confirmed(a) });
    // One confirmed trip per vehicle.
    await expect(prisma.dispatchAssignment.create({ data: confirmed(b) })).rejects.toMatchObject({
      code: 'P2002',
    });
    // One open offer per transfer.
    await expect(
      prisma.dispatchAssignment.create({
        data: { ...confirmed(a), status: 'PROPOSED', vehicleId: vehicle('GKB 201A') },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    // Transfer history can't be rewritten.
    await expect(
      prisma.transferEvent.updateMany({ where: { transferId: a }, data: { note: 'edited' } }),
    ).rejects.toThrow(/append-only/);

    await prisma.dispatchAssignment.update({
      where: { id: first.id },
      data: { status: 'WITHDRAWN' },
    });
    await clinician
      .post(`/api/transfers/${a}/cancel`)
      .send({ reason: 'Test finished' })
      .expect(204);
    await clinician
      .post(`/api/transfers/${b}/cancel`)
      .send({ reason: 'Test finished' })
      .expect(204);
  });

  it('lets network operations arrange transport, and cancelling the referral stands the ambulance down', async () => {
    const referralId = await acceptedReferral();
    const transferId = await requestTransport(referralId);
    expect((await list(operations, 'network')).find((t) => t.id === transferId)?.attention).toBe(
      'No vehicle offered yet',
    );
    const offered = await offer(operations, transferId, 'KDA 102B');
    expect(offered.status, JSON.stringify(offered.body)).toBe(201);
    await dispatcher
      .post(`/api/dispatch-assignments/${offered.body.id}/confirm`)
      .send({ vehicleId: vehicle('KDA 102B'), crewMemberIds: [crew('James Kibet')] })
      .expect(204);

    await clinician
      .post(`/api/referrals/${referralId}/cancel`)
      .send({ reason: 'Patient’s family chose a private hospital' })
      .expect(204);
    const view = await transfer(clinician, transferId);
    expect(view.status).toBe('CANCELLED');
    expect(view.assignments[0]).toMatchObject({
      status: 'WITHDRAWN',
      endReason: 'Transfer cancelled',
    });
    const vehicles = (await dispatcher.get(`/api/networks/${ids.networkId}/vehicles`))
      .body as VehicleView[];
    expect(vehicles.find((v) => v.registration === 'KDA 102B')?.onTransfer).toBeNull();
    expect((await list(dispatcher, 'provider')).some((t) => t.id === transferId)).toBe(false);
  });
});

describe('fleet', () => {
  let vehicleId: string;

  it('lets the provider administrator register a vehicle, which starts off duty', async () => {
    const res = await providerAdmin
      .post(`/api/institutions/${ids.ambulance}/vehicles`)
      .send({ registration: 'kdb 555e', capability: 'ALS', equipment: ['OXYGEN'] });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    vehicleId = res.body.id;
    const vehicles = (await providerAdmin.get(`/api/networks/${ids.networkId}/vehicles`))
      .body as VehicleView[];
    expect(vehicles.find((v) => v.id === vehicleId)).toMatchObject({
      registration: 'KDB 555E',
      status: 'OFF_DUTY',
      stale: true,
      statusUpdatedAt: null,
    });

    const duplicate = await providerAdmin
      .post(`/api/institutions/${ids.ambulance}/vehicles`)
      .send({ registration: 'KDB 555E', capability: 'BLS' });
    expect(duplicate.status).toBe(409);
  });

  it('suggests it once a dispatcher confirms it is available', async () => {
    const transferId = await requestTransport(await acceptedReferral());
    const before = await suggestions(clinician, transferId);
    expect(before.suggestions.some((s) => s.vehicle.id === vehicleId)).toBe(false);

    await dispatcher
      .post(`/api/vehicles/${vehicleId}/status`)
      .send({ status: 'AVAILABLE', note: 'Day shift' })
      .expect(204);
    const after = await suggestions(clinician, transferId);
    expect(after.suggestions.some((s) => s.vehicle.id === vehicleId)).toBe(true);
  });

  it('keeps fleet management with the provider administrator', async () => {
    await dispatcher
      .post(`/api/institutions/${ids.ambulance}/vehicles`)
      .send({ registration: 'KDB 556F', capability: 'BLS' })
      .expect(403);
    await countyDispatcher
      .post(`/api/vehicles/${vehicleId}/status`)
      .send({ status: 'OUT_OF_SERVICE' })
      .expect(403);
    await clinician.get(`/api/networks/${ids.networkId}/vehicles`).expect(403);
  });

  it('shows each provider its own fleet and network operations every fleet', async () => {
    const own = (await countyDispatcher.get(`/api/networks/${ids.networkId}/vehicles`))
      .body as VehicleView[];
    expect(new Set(own.map((v) => v.provider.name))).toEqual(
      new Set(['Demo County Ambulance Service']),
    );
    const all = (await operations.get(`/api/networks/${ids.networkId}/vehicles`))
      .body as VehicleView[];
    expect(new Set(all.map((v) => v.provider.id))).toEqual(
      new Set([ids.ambulance, ids.institution('DCAS')]),
    );
  });

  it('manages crew, linking accounts that have the crew role', async () => {
    const res = await providerAdmin.get(`/api/institutions/${ids.ambulance}/crew`);
    const body = res.body as CrewListResponse;
    expect(body.crew.find((c) => c.fullName === 'Kevin Ochieng')?.account?.email).toBe(
      'crew@demo.lifeline.test',
    );
    expect(body.unlinkedAccounts).toEqual([]);

    const dispatcherUser = await prismaOf(app).user.findUniqueOrThrow({
      where: { email: 'dispatcher@demo.lifeline.test' },
    });
    await providerAdmin
      .post(`/api/institutions/${ids.ambulance}/crew`)
      .send({ fullName: 'Brian Mutua', qualification: 'EMT', userId: dispatcherUser.id })
      .expect(400);
    const created = await providerAdmin
      .post(`/api/institutions/${ids.ambulance}/crew`)
      .send({ fullName: 'Lilian Wairimu', qualification: 'PARAMEDIC', phone: '+254700000177' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
  });
});
