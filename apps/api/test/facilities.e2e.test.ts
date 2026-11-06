import { type INestApplication } from '@nestjs/common';
import {
  type CapacityEntry,
  type CatalogueResponse,
  type FacilityDetail,
  type FacilitySearchResult,
} from '@lifeline/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Agent, createApp, demoIds, prismaOf, signIn } from './helpers';

let app: INestApplication;
let ids: Awaited<ReturnType<typeof demoIds>>;
let clinician: Agent;
let coordinator: Agent;
let northAdmin: Agent;
let networkAdmin: Agent;

beforeAll(async () => {
  app = await createApp();
  ids = await demoIds(app);
  clinician = (await signIn(app, 'clinician.north@demo.lifeline.test')).agent;
  coordinator = (await signIn(app, 'coordinator.north@demo.lifeline.test')).agent;
  northAdmin = (await signIn(app, 'admin.north@demo.lifeline.test')).agent;
  networkAdmin = (await signIn(app, 'network.admin@demo.lifeline.test')).agent;
});

afterAll(async () => {
  await app.close();
});

const search = (
  agent: Agent,
  query: { serviceIds?: string[]; resourceIds?: string[]; originId?: string },
) =>
  agent.get(`/api/networks/${ids.networkId}/facilities`).query({
    serviceIds: query.serviceIds?.join(','),
    resourceIds: query.resourceIds?.join(','),
    originId: query.originId,
  });

describe('catalogue', () => {
  it('is visible to every network member', async () => {
    const res = await clinician.get(`/api/networks/${ids.networkId}/catalogue`);
    expect(res.status).toBe(200);
    const body = res.body as CatalogueResponse;
    expect(body.services.map((s) => s.code)).toContain('NEURO');
    expect(body.resources.find((r) => r.code === 'BED_ICU')?.kind).toBe('BED');
    expect(body.capacityStaleAfterMinutes).toBeGreaterThan(0);
  });

  it('is refused outside the network', async () => {
    await clinician.get('/api/networks/another-network/catalogue').expect(403);
  });
});

describe('finding a receiving facility (Phase 1 done-when)', () => {
  it('lists facilities offering the service, nearest first, with timestamped capacity', async () => {
    const res = await search(clinician, { serviceIds: [ids.service('ICU')], originId: ids.north });
    expect(res.status).toBe(200);
    const results = res.body as FacilitySearchResult[];

    // North has no ICU and is the origin; South has no ICU.
    expect(new Set(results.map((r) => r.facility.id))).toEqual(
      new Set([ids.west, ids.national, ids.east]),
    );
    const minutes = results.map((r) => r.travelMinutes!);
    expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
    expect(results[0]!.distanceKm).toBeGreaterThan(0);

    const nationalIcu = results
      .find((r) => r.facility.id === ids.national)!
      .capacity.find((c) => c.resource.code === 'BED_ICU')!;
    expect(nationalIcu).toMatchObject({ status: 'LIMITED', available: 1, total: 30, stale: false });
    expect(nationalIcu.updatedAt).toBeTruthy();
    expect(nationalIcu.updatedBy?.fullName).toBe('Mercy Achieng');
  });

  it('marks reports older than the network threshold as stale', async () => {
    const res = await search(clinician, { serviceIds: [ids.service('ICU')], originId: ids.north });
    const west = (res.body as FacilitySearchResult[]).find((r) => r.facility.id === ids.west)!;
    expect(west.capacity.every((c) => c.stale)).toBe(true);
  });

  it('requires every requested service', async () => {
    const res = await search(clinician, { serviceIds: [ids.service('ICU'), ids.service('NEURO')] });
    expect((res.body as FacilitySearchResult[]).map((r) => r.facility.id)).toEqual([ids.national]);
  });

  it('drops facilities whose current report says the resource is unavailable', async () => {
    const res = await search(clinician, {
      resourceIds: [ids.resource('BED_NICU')],
      originId: ids.north,
    });
    const found = (res.body as FacilitySearchResult[]).map((r) => r.facility.id);
    expect(found).toContain(ids.east);
    expect(found).not.toContain(ids.national);
  });

  it('keeps facilities with stale reports but flags them for confirmation', async () => {
    const res = await search(clinician, {
      resourceIds: [ids.resource('BED_ICU')],
      originId: ids.north,
    });
    const west = (res.body as FacilitySearchResult[]).find((r) => r.facility.id === ids.west)!;
    expect(west.unconfirmedResourceIds).toEqual([ids.resource('BED_ICU')]);
  });

  it('rejects an origin outside the network', async () => {
    await search(clinician, { originId: 'not-a-facility' }).expect(400);
  });
});

describe('facility detail', () => {
  it('shows profile, departments, capacity and recent reports', async () => {
    const res = await clinician.get(`/api/institutions/${ids.national}`);
    expect(res.status).toBe(200);
    const detail = res.body as FacilityDetail;
    expect(detail.facility.phone).toBe('+254700000101');
    expect(detail.departments.map((d) => d.name)).toContain('Critical Care Unit');
    expect(detail.capacity[0]!.resource.kind).toBe('BED');
    expect(detail.recentUpdates.length).toBeGreaterThan(0);
  });
});

describe('reporting capacity', () => {
  const report = (agent: Agent, institutionId: string, reports: unknown[]) =>
    agent.post(`/api/institutions/${institutionId}/capacity`).send({ reports });

  it('records a report, updates current figures and keeps history', async () => {
    const res = await report(coordinator, ids.north, [
      {
        resourceId: ids.resource('BED_MATERNITY'),
        status: 'LIMITED',
        available: 2,
        total: 24,
        note: 'Two discharges pending',
      },
      { resourceId: ids.resource('SP_OBSTETRICIAN'), status: 'AVAILABLE' },
    ]);
    expect(res.status).toBe(200);
    const maternity = (res.body as CapacityEntry[]).find(
      (c) => c.resource.code === 'BED_MATERNITY',
    )!;
    expect(maternity).toMatchObject({
      status: 'LIMITED',
      available: 2,
      note: 'Two discharges pending',
      stale: false,
    });
    expect(maternity.updatedBy?.fullName).toBe('Peter Kamau');

    const history = await prismaOf(app).capacityUpdate.count({
      where: { institutionId: ids.north, resourceId: ids.resource('BED_MATERNITY') },
    });
    expect(history).toBe(2);
    const event = await prismaOf(app).auditEvent.findFirst({
      where: { action: 'capacity.updated', institutionId: ids.north },
    });
    expect(event).not.toBeNull();
  });

  it('only lets staff report for their own facility', async () => {
    await report(coordinator, ids.national, [
      { resourceId: ids.resource('BED_ICU'), status: 'UNAVAILABLE', available: 0 },
    ]).expect(403);
  });

  it('does not let clinicians without the permission report', async () => {
    await report(clinician, ids.north, [
      { resourceId: ids.resource('BED_GENERAL'), status: 'AVAILABLE', available: 4 },
    ]).expect(403);
  });

  it('rejects inconsistent bed reports with a field error', async () => {
    const res = await report(coordinator, ids.north, [
      { resourceId: ids.resource('BED_GENERAL'), status: 'AVAILABLE', available: 0 },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      { path: 'reports.0', message: 'With no free beds, mark this as unavailable.' },
    ]);
  });

  it('rejects items the facility does not track', async () => {
    const res = await report(coordinator, ids.north, [
      { resourceId: ids.resource('BED_ICU'), status: 'UNAVAILABLE', available: 0 },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.errors[0].message).toMatch(/not tracked/);
  });

  it('keeps capacity history append-only', async () => {
    await expect(
      prismaOf(app).$executeRawUnsafe(`UPDATE "CapacityUpdate" SET available = 99`),
    ).rejects.toThrow(/append-only/);
  });
});

describe('managing facility profiles', () => {
  it('lets a facility admin update contact and location details', async () => {
    const res = await northAdmin
      .patch(`/api/institutions/${ids.north}/profile`)
      .send({ phone: '+254700000169', latitude: -1.006, longitude: 36.904 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ phone: '+254700000169', latitude: -1.006 });
  });

  it('rejects coordinates outside Kenya', async () => {
    const res = await northAdmin
      .patch(`/api/institutions/${ids.north}/profile`)
      .send({ latitude: 36.9, longitude: -1.0 });
    expect(res.status).toBe(400);
  });

  it('stops a facility admin editing another facility or identity fields', async () => {
    await northAdmin
      .patch(`/api/institutions/${ids.national}/profile`)
      .send({ phone: '+254700000100' })
      .expect(403);
    await northAdmin
      .patch(`/api/institutions/${ids.north}/identity`)
      .send({ level: 5 })
      .expect(403);
  });

  it('manages services, tracked items and departments', async () => {
    await northAdmin
      .put(`/api/institutions/${ids.north}/services`)
      .send({ serviceIds: [ids.service('EMERGENCY'), ids.service('CEMONC'), ids.service('HDU')] })
      .expect(204);
    await northAdmin
      .put(`/api/institutions/${ids.north}/resources`)
      .send({
        resourceIds: [
          ids.resource('BED_MATERNITY'),
          ids.resource('BED_GENERAL'),
          ids.resource('BED_HDU'),
        ],
      })
      .expect(204);

    const created = await northAdmin
      .post(`/api/institutions/${ids.north}/departments`)
      .send({ name: 'High Dependency Unit', phone: '+254700000173' });
    expect(created.status).toBe(201);
    await northAdmin
      .patch(`/api/departments/${created.body.id}`)
      .send({ name: 'HDU', phone: '' })
      .expect(200);

    const detail = (await northAdmin.get(`/api/institutions/${ids.north}`)).body as FacilityDetail;
    expect(detail.services.map((s) => s.code)).toEqual(['EMERGENCY', 'HDU', 'CEMONC']);
    expect(detail.capacity.map((c) => c.resource.code)).toEqual([
      'BED_HDU',
      'BED_MATERNITY',
      'BED_GENERAL',
    ]);
    expect(detail.capacity.find((c) => c.resource.code === 'BED_HDU')!.status).toBeNull();
    expect(detail.departments.find((d) => d.name === 'HDU')?.phone).toBeNull();

    await northAdmin.delete(`/api/departments/${created.body.id}`).expect(204);
    // History for the untracked theatre and obstetrician reports is kept.
    const history = await prismaOf(app).capacityUpdate.count({
      where: { institutionId: ids.north, resourceId: ids.resource('SP_OBSTETRICIAN') },
    });
    expect(history).toBe(2);
  });

  it('rejects services from outside the catalogue', async () => {
    await northAdmin
      .put(`/api/institutions/${ids.north}/services`)
      .send({ serviceIds: ['nope'] })
      .expect(400);
  });
});

describe('onboarding institutions', () => {
  const newFacility = {
    type: 'FACILITY',
    name: 'Demo Health Centre Ruiru',
    code: 'dhc-ruiru',
    level: 3,
    county: 'Kiambu',
    latitude: -1.146,
    longitude: 36.961,
  };

  it('lets a network admin add a facility', async () => {
    const res = await networkAdmin
      .post(`/api/networks/${ids.networkId}/institutions`)
      .send(newFacility);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ code: 'DHC-RUIRU', level: 3, status: 'ACTIVE' });
  });

  it('rejects a duplicate code', async () => {
    const res = await networkAdmin
      .post(`/api/networks/${ids.networkId}/institutions`)
      .send(newFacility);
    expect(res.status).toBe(409);
    expect(res.body.errors[0].path).toBe('code');
  });

  it('does not let facility admins add institutions', async () => {
    await northAdmin
      .post(`/api/networks/${ids.networkId}/institutions`)
      .send({ ...newFacility, code: 'OTHER' })
      .expect(403);
  });

  it('lets a network admin deactivate a facility, removing it from search', async () => {
    await networkAdmin
      .patch(`/api/institutions/${ids.south}/identity`)
      .send({ status: 'INACTIVE' })
      .expect(200);
    const res = await search(clinician, { serviceIds: [ids.service('CEMONC')] });
    expect((res.body as FacilitySearchResult[]).map((r) => r.facility.id)).not.toContain(ids.south);
    await networkAdmin
      .patch(`/api/institutions/${ids.south}/identity`)
      .send({ status: 'ACTIVE' })
      .expect(200);
  });
});
