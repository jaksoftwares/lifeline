import { type INestApplication } from '@nestjs/common';
import { type SuccessMetricsReport } from '@lifeline/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Agent, createApp, demoIds, prismaOf, signIn } from './helpers';

let app: INestApplication;
let ids: Awaited<ReturnType<typeof demoIds>>;
let networkAdmin: Agent;
let northAdmin: Agent;
let nationalAdmin: Agent;
let clinician: Agent;
let referralId: string;

const periodFrom = '2020-06-01';
const periodTo = '2020-06-01';
const reportQuery = { networkId: '', from: periodFrom, to: periodTo };

beforeAll(async () => {
  app = await createApp();
  ids = await demoIds(app);
  reportQuery.networkId = ids.networkId;
  networkAdmin = (await signIn(app, 'network.admin@demo.lifeline.test')).agent;
  northAdmin = (await signIn(app, 'admin.north@demo.lifeline.test')).agent;
  nationalAdmin = (await signIn(app, 'admin.national@demo.lifeline.test')).agent;
  clinician = (await signIn(app, 'clinician.north@demo.lifeline.test')).agent;
});

afterAll(async () => {
  await app.close();
});

describe('Phase 8 reports and network administration', () => {
  it('calculates report metrics from persisted referral and transfer timestamps', async () => {
    const created = await clinician.post('/api/referrals').send({
      referringInstitutionId: ids.north,
      patient: { fullName: 'Report Test', sex: 'UNKNOWN' },
      reason: 'Requires specialist care.',
      clinicalSummary: 'Stable for transfer.',
      urgency: 'URGENT',
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    referralId = created.body.id as string;
    await clinician
      .post(`/api/referrals/${referralId}/submit`)
      .send({ institutionIds: [ids.national, ids.east] })
      .expect(204);

    const prisma = prismaOf(app);
    const referral = await prisma.referral.findUniqueOrThrow({
      where: { id: referralId },
      include: { requests: true },
    });
    const start = new Date('2020-06-01T08:00:00.000Z');
    const after = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
    const nationalRequest = referral.requests.find((item) => item.institutionId === ids.national)!;
    const eastRequest = referral.requests.find((item) => item.institutionId === ids.east)!;
    await prisma.referral.update({
      where: { id: referralId },
      data: {
        createdAt: start,
        submittedAt: after(2),
        acceptedAt: after(5),
        acceptedRequestId: nationalRequest.id,
        status: 'ACCEPTED',
      },
    });
    await prisma.referralRequest.update({
      where: { id: nationalRequest.id },
      data: { sentAt: after(1), respondedAt: after(5), status: 'ACCEPTED' },
    });
    await prisma.referralRequest.update({
      where: { id: eastRequest.id },
      data: { sentAt: after(1), respondedAt: after(5), status: 'DECLINED' },
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'clinician.north@demo.lifeline.test' },
    });
    const vehicle = await prisma.vehicle.findFirstOrThrow({
      where: { networkId: ids.networkId, recordStatus: 'ACTIVE' },
    });
    const idleVehicle = await prisma.vehicle.findFirstOrThrow({
      where: { networkId: ids.networkId, recordStatus: 'ACTIVE', id: { not: vehicle.id } },
    });
    await prisma.transfer.create({
      data: {
        networkId: ids.networkId,
        referralId,
        status: 'COMPLETED',
        pickupInstitutionId: ids.north,
        destinationInstitutionId: ids.national,
        requiredCapability: 'BLS',
        requiredEquipment: [],
        requestedById: user.id,
        requestedAt: after(6),
        assignedAt: after(7),
        dispatchedAt: after(8),
        atPickupAt: after(9),
        collectedAt: after(12),
        arrivedAt: after(32),
        handedOverAt: after(33),
        completedAt: after(34),
        handover: {
          create: {
            patientIdentityConfirmed: true,
            clinicalSummaryReceived: true,
            latestObservationsReceived: true,
            treatmentAndAllergiesReviewed: true,
            documentsAndResultsAddressed: true,
            signedById: user.id,
            signedAt: after(33),
          },
        },
        cost: {
          create: {
            amount: '1200.00',
            payer: 'COUNTY_GOVERNMENT',
            recordedById: user.id,
            recordedAt: after(33),
          },
        },
        assignments: {
          create: {
            kind: 'PROVIDER',
            status: 'COMPLETED',
            providerId: vehicle.institutionId,
            vehicleId: vehicle.id,
            proposedById: user.id,
            respondedAt: after(10),
            endedAt: after(20),
          },
        },
      },
    });
    await prisma.vehicleStatusEvent.createMany({
      data: [
        {
          vehicleId: vehicle.id,
          status: 'AVAILABLE',
          recordStatus: 'ACTIVE',
          recordedAt: start,
        },
        {
          vehicleId: vehicle.id,
          status: 'OUT_OF_SERVICE',
          recordStatus: 'ACTIVE',
          recordedAt: after(60),
        },
        {
          vehicleId: idleVehicle.id,
          status: 'AVAILABLE',
          recordStatus: 'ACTIVE',
          recordedAt: start,
        },
      ],
    });

    const report = await networkAdmin
      .get('/api/reports/success-metrics')
      .query(reportQuery)
      .expect(200);
    const body = report.body as SuccessMetricsReport;
    expect(body.metrics.referralInitiationMinutes.value).toBe(2);
    expect(body.metrics.facilityAcceptanceMinutes.value).toBe(3);
    expect(body.metrics.referralRejectionRate).toMatchObject({
      value: 50,
      numerator: 1,
      denominator: 2,
    });
    expect(body.metrics.ambulanceAssignmentMinutes.value).toBe(1);
    expect(body.metrics.ambulanceResponseMinutes.value).toBe(1);
    expect(body.metrics.patientCollectionMinutes.value).toBe(3);
    expect(body.metrics.transferDurationMinutes.value).toBe(20);
    expect(body.metrics.handoverCompletionRate.value).toBe(100);
    expect(body.metrics.referralCompletionRate.value).toBe(100);
    expect(body.metrics.ambulanceUtilisation.value).toBe(1.3);
    expect(body.metrics.transferCostTotal.value).toBe(1200);
    expect(body.metrics.transferCostAverage.value).toBe(1200);
  });

  it('enforces report permission and institution scope', async () => {
    await clinician.get('/api/reports/success-metrics').query(reportQuery).expect(403);
    await northAdmin
      .get('/api/reports/success-metrics')
      .query({ ...reportQuery, institutionId: ids.east })
      .expect(403);
    await northAdmin.get('/api/reports/success-metrics').query(reportQuery).expect(200);
    const receivingReport = await nationalAdmin
      .get('/api/reports/success-metrics')
      .query({ ...reportQuery, institutionId: ids.national })
      .expect(200);
    expect(receivingReport.body.metrics.facilityAcceptanceMinutes.value).toBe(3);
    expect(receivingReport.body.metrics.referralInitiationMinutes.value).toBeNull();
    expect(receivingReport.body.metrics.referralCompletionRate.value).toBeNull();
  });

  it('exports escaped CSV and a real PDF attachment', async () => {
    const prisma = prismaOf(app);
    const originalNetwork = await prisma.network.findUniqueOrThrow({
      where: { id: ids.networkId },
      select: { name: true },
    });
    await prisma.network.update({
      where: { id: ids.networkId },
      data: { name: '=SUM(1,2),"Pilot"' },
    });
    try {
      const csv = await networkAdmin
        .get('/api/reports/success-metrics.csv')
        .query(reportQuery)
        .expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['content-disposition']).toContain('.csv');
      expect(csv.text).toContain('"referralRejectionRate"');
      expect(csv.text).toContain(`"report","","Network","'=SUM(1,2),""Pilot""","","",""`);
      expect(csv.text).toContain(
        '"metric","ambulanceUtilisation","Ambulance utilisation","1.3","percent","10","780"',
      );
    } finally {
      await prisma.network.update({
        where: { id: ids.networkId },
        data: { name: originalNetwork.name },
      });
    }

    const pdf = await networkAdmin
      .get('/api/reports/success-metrics.pdf')
      .query(reportQuery)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.headers['content-disposition']).toContain('.pdf');
    expect(pdf.body.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.body.length).toBeGreaterThan(1000);
  });

  it('validates report periods and audits network-setting changes', async () => {
    await networkAdmin
      .get('/api/reports/success-metrics')
      .query({ ...reportQuery, from: '2021-01-02', to: '2021-01-01' })
      .expect(400);
    await northAdmin.get(`/api/networks/${ids.networkId}/settings`).expect(403);

    const before = await networkAdmin.get(`/api/networks/${ids.networkId}/settings`).expect(200);
    const updated = {
      capacityStaleAfterMinutes: before.body.capacityStaleAfterMinutes + 1,
      vehicleStatusStaleAfterMinutes: before.body.vehicleStatusStaleAfterMinutes + 1,
      earlyWarningScore: before.body.earlyWarningScore,
    };
    await networkAdmin.put(`/api/networks/${ids.networkId}/settings`).send(updated).expect(200);
    const event = await prismaOf(app).auditEvent.findFirstOrThrow({
      where: {
        action: 'network.settings_updated',
        networkId: ids.networkId,
      },
      orderBy: { occurredAt: 'desc' },
    });
    expect(event.metadata).toMatchObject({ current: updated });
    await networkAdmin
      .put(`/api/networks/${ids.networkId}/settings`)
      .send({
        capacityStaleAfterMinutes: before.body.capacityStaleAfterMinutes,
        vehicleStatusStaleAfterMinutes: before.body.vehicleStatusStaleAfterMinutes,
        earlyWarningScore: before.body.earlyWarningScore,
      })
      .expect(200);
  });
});
