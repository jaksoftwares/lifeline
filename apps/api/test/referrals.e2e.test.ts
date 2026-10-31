import { type INestApplication } from '@nestjs/common';
import { type ReferralDetail, type ReferralSummary } from '@lifeline/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Agent, createApp, demoIds, prismaOf, signIn } from './helpers';

let app: INestApplication;
let ids: Awaited<ReturnType<typeof demoIds>>;
let clinician: Agent;
let national: Agent;
let east: Agent;
let west: Agent;
let operations: Agent;
let northAdmin: Agent;
let ambulanceAdmin: Agent;

beforeAll(async () => {
  app = await createApp();
  ids = await demoIds(app);
  clinician = (await signIn(app, 'clinician.north@demo.lifeline.test')).agent;
  national = (await signIn(app, 'receiving.national@demo.lifeline.test')).agent;
  east = (await signIn(app, 'receiving.east@demo.lifeline.test')).agent;
  west = (await signIn(app, 'receiving.west@demo.lifeline.test')).agent;
  operations = (await signIn(app, 'operations@demo.lifeline.test')).agent;
  northAdmin = (await signIn(app, 'admin.north@demo.lifeline.test')).agent;
  ambulanceAdmin = (await signIn(app, 'admin.ambulance@demo.lifeline.test')).agent;
});

afterAll(async () => {
  await app.close();
});

const detail = async (agent: Agent, id: string) => {
  const res = await agent.get(`/api/referrals/${id}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as ReferralDetail;
};

const list = async (agent: Agent, box: string, open = false) => {
  const res = await agent
    .get('/api/referrals')
    .query({ networkId: ids.networkId, box, open: String(open) });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as ReferralSummary[];
};

async function createDraft(overrides: Record<string, unknown> = {}) {
  const res = await clinician.post('/api/referrals').send({
    referringInstitutionId: ids.north,
    patient: {
      fullName: 'Akinyi Odhiambo',
      sex: 'FEMALE',
      dateOfBirth: '1979-03-14',
      nationalId: '23456789',
    },
    pregnancyStatus: 'NOT_PREGNANT',
    reason: 'Sepsis with worsening respiratory failure; needs ICU.',
    clinicalSummary:
      'Three days of fever and cough. Increasing oxygen requirement despite antibiotics.',
    provisionalDiagnosis: 'Severe community-acquired pneumonia with sepsis',
    urgency: 'URGENT',
    requiredServiceIds: [ids.service('ICU')],
    ...overrides,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; reference: string };
}

describe('a referral reaches Accepted with full history (Phase 2 done-when)', () => {
  let referralId: string;
  let requestIds: Record<'national' | 'east' | 'west', string>;

  it('starts as a draft with a readable reference', async () => {
    const created = await createDraft();
    referralId = created.id;
    expect(created.reference).toMatch(/^DEMO-\d{2}-\d{5}$/);
    const view = await detail(clinician, referralId);
    expect(view).toMatchObject({
      status: 'DRAFT',
      urgency: 'URGENT',
      viewer: { isReferrer: true },
    });
    expect(view.requiredServices.map((s) => s.code)).toEqual(['ICU']);
  });

  it('calculates the network’s early-warning score from recorded observations', async () => {
    const res = await clinician.post(`/api/referrals/${referralId}/assessments`).send({
      respiratoryRate: 28,
      oxygenSaturation: 89,
      onSupplementalOxygen: true,
      systolicBp: 98,
      diastolicBp: 60,
      heartRate: 118,
      temperature: 39.4,
      consciousness: 'ALERT',
    });
    expect(res.status).toBe(201);
    // NEWS2: RR 3 + SpO2 3 + O2 2 + BP 2 + HR 2 + T 2 + alert 0
    expect(res.body.score).toMatchObject({ type: 'NEWS2', total: 14, band: 'HIGH' });
    expect(res.body.score.points.oxygenSaturation).toBe(3);
  });

  it('refuses to send an incomplete referral', async () => {
    const draft = await createDraft({ reason: '', urgency: null });
    const res = await clinician
      .post(`/api/referrals/${draft.id}/submit`)
      .send({ institutionIds: [ids.national] });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { path: string }) => e.path).sort()).toEqual([
      'reason',
      'urgency',
    ]);
  });

  it('keeps drafts private to the referring facility', async () => {
    await national.get(`/api/referrals/${referralId}`).expect(404);
  });

  it('sends to several facilities at once', async () => {
    await clinician
      .post(`/api/referrals/${referralId}/submit`)
      .send({ institutionIds: [ids.national, ids.east, ids.west] })
      .expect(204);
    const view = await detail(clinician, referralId);
    expect(view.status).toBe('SUBMITTED');
    expect(view.requests.map((r) => r.status)).toEqual(['PENDING', 'PENDING', 'PENDING']);
    const byInstitution = (institutionId: string) =>
      view.requests.find((r) => r.institution.id === institutionId)!.id;
    requestIds = {
      national: byInstitution(ids.national),
      east: byInstitution(ids.east),
      west: byInstitution(ids.west),
    };
  });

  it('puts it in each receiving facility’s inbox, showing only their own request', async () => {
    const inbox = await list(national, 'incoming', true);
    const item = inbox.find((r) => r.id === referralId)!;
    expect(item.nextAction).toBe('Respond to request');
    expect(item.requests.map((r) => r.id)).toEqual([requestIds.national]);

    const view = await detail(national, referralId);
    expect(view.requests.map((r) => r.id)).toEqual([requestIds.national]);
    expect(view.viewer).toMatchObject({
      isReferrer: false,
      respondableRequestIds: [requestIds.national],
    });
    expect(view.patient.nationalId).toBe('23456789');
  });

  it('lets a facility ask for more information, and the referrer answer', async () => {
    await east
      .post(`/api/referral-requests/${requestIds.east}/respond`)
      .send({ decision: 'REQUEST_INFO', question: 'What is the latest arterial blood gas?' })
      .expect(204);

    const outgoing = await list(clinician, 'outgoing', true);
    expect(outgoing.find((r) => r.id === referralId)!.nextAction).toBe(
      'Answer information request',
    );

    await clinician
      .post(`/api/referral-requests/${requestIds.east}/messages`)
      .send({ body: 'pH 7.31, pO2 7.2 kPa on 6 L/min, lactate 3.1.' })
      .expect(204);

    const view = await detail(east, referralId);
    expect(view.requests[0]!.status).toBe('PENDING');
    expect(view.requests[0]!.messages.map((m) => m.kind)).toEqual([
      'INFO_REQUEST',
      'INFO_RESPONSE',
    ]);
  });

  it('records a decline with its reason', async () => {
    await west
      .post(`/api/referral-requests/${requestIds.west}/respond`)
      .send({ decision: 'DECLINE', declineReason: 'NO_BED', note: 'ICU full until tomorrow' })
      .expect(204);
    const view = await detail(west, referralId);
    expect(view.requests[0]).toMatchObject({ status: 'DECLINED', declineReason: 'NO_BED' });
  });

  it('accepts at the first facility to confirm and withdraws the others', async () => {
    const department = await prismaOf(app).department.findFirstOrThrow({
      where: { institutionId: ids.national, name: 'Critical Care Unit' },
    });
    const readyAt = new Date(Date.now() + 45 * 60_000).toISOString();
    await national
      .post(`/api/referral-requests/${requestIds.national}/respond`)
      .send({
        decision: 'ACCEPT',
        note: 'Bed 4 reserved. Call on arrival.',
        receivingDepartmentId: department.id,
        readyAt,
      })
      .expect(204);

    const view = await detail(clinician, referralId);
    expect(view.status).toBe('ACCEPTED');
    const status = Object.fromEntries(view.requests.map((r) => [r.institution.id, r.status]));
    expect(status).toEqual({
      [ids.national]: 'ACCEPTED',
      [ids.east]: 'WITHDRAWN',
      [ids.west]: 'DECLINED',
    });
    const accepted = view.requests.find((r) => r.id === requestIds.national)!;
    expect(accepted.receivingDepartment?.name).toBe('Critical Care Unit');
    expect(accepted.respondedBy?.fullName).toBe('Dr. Samuel Otieno');
  });

  it('stops a second facility accepting the same patient', async () => {
    const res = await east
      .post(`/api/referral-requests/${requestIds.east}/respond`)
      .send({ decision: 'ACCEPT' });
    expect(res.status).toBe(409);
  });

  it('keeps a complete, ordered history', async () => {
    const view = await detail(clinician, referralId);
    expect(view.events.map((e) => e.type)).toEqual([
      'CREATED',
      'ASSESSMENT_RECORDED',
      'SUBMITTED',
      'REQUEST_SENT',
      'REQUEST_SENT',
      'REQUEST_SENT',
      'INFO_REQUESTED',
      'INFO_PROVIDED',
      'DECLINED',
      'ACCEPTED',
      'WITHDRAWN',
    ]);
    expect(view.events.every((e) => e.occurredAt)).toBe(true);
    expect(view.events.find((e) => e.type === 'ACCEPTED')!.actor?.fullName).toBe(
      'Dr. Samuel Otieno',
    );
  });

  it('shows a receiving facility only the history that concerns it', async () => {
    const view = await detail(west, referralId);
    const sentTo = view.events
      .filter((e) => e.type === 'REQUEST_SENT')
      .map((e) => e.institution?.id);
    expect(sentTo).toEqual([ids.west]);
    expect(view.events.some((e) => e.type === 'INFO_REQUESTED')).toBe(false);
  });

  it('closes the conversation with a facility that declined', async () => {
    await clinician
      .post(`/api/referral-requests/${requestIds.west}/messages`)
      .send({ body: 'Thanks' })
      .expect(409);
  });

  it('cannot be altered in the database', async () => {
    await expect(prismaOf(app).$executeRawUnsafe(`DELETE FROM "ReferralEvent"`)).rejects.toThrow(
      /append-only/,
    );
    await expect(
      prismaOf(app).$executeRawUnsafe(`UPDATE "ClinicalAssessment" SET "heartRate" = 60`),
    ).rejects.toThrow(/append-only/);
  });

  it('records who opened the patient’s information', async () => {
    const views = await prismaOf(app).auditEvent.count({
      where: { action: 'referral.viewed', entityId: referralId },
    });
    expect(views).toBeGreaterThanOrEqual(4); // clinician, national, east and west at least once each
  });
});

describe('who can see and act on referrals', () => {
  let referralId: string;
  let requestId: string;

  beforeAll(async () => {
    referralId = (await createDraft({ urgency: 'ROUTINE' })).id;
    await clinician
      .post(`/api/referrals/${referralId}/submit`)
      .send({ institutionIds: [ids.national] })
      .expect(204);
    requestId = (await detail(clinician, referralId)).requests[0]!.id;
  });

  it('hides referrals from staff at uninvolved institutions', async () => {
    await east.get(`/api/referrals/${referralId}`).expect(404);
    await ambulanceAdmin.get(`/api/referrals/${referralId}`).expect(404);
  });

  it('refuses inbox access without referral permissions', async () => {
    await northAdmin
      .get('/api/referrals')
      .query({ networkId: ids.networkId, box: 'outgoing' })
      .expect(403);
  });

  it('gives network operations a network-wide view but no network box to facility staff', async () => {
    expect((await list(operations, 'network')).map((r) => r.id)).toContain(referralId);
    await clinician
      .get('/api/referrals')
      .query({ networkId: ids.networkId, box: 'network' })
      .expect(403);
  });

  it('only lets the receiving facility respond to its own request', async () => {
    await east
      .post(`/api/referral-requests/${requestId}/respond`)
      .send({ decision: 'DECLINE', declineReason: 'NO_BED' })
      .expect(404);
    await clinician
      .post(`/api/referral-requests/${requestId}/respond`)
      .send({ decision: 'ACCEPT' })
      .expect(403);
  });

  it('lets the referrer add another facility and withdraw one', async () => {
    await clinician
      .post(`/api/referrals/${referralId}/requests`)
      .send({ institutionIds: [ids.west] })
      .expect(204);
    await clinician
      .post(`/api/referrals/${referralId}/requests`)
      .send({ institutionIds: [ids.west] })
      .expect(409);
    await clinician
      .post(`/api/referral-requests/${requestId}/withdraw`)
      .send({ reason: 'Family prefers West' })
      .expect(204);
    const view = await detail(clinician, referralId);
    expect(view.requests.map((r) => r.status)).toEqual(['WITHDRAWN', 'PENDING']);
  });

  it('cancels a referral and withdraws open requests', async () => {
    await clinician
      .post(`/api/referrals/${referralId}/cancel`)
      .send({ reason: 'Patient improved' })
      .expect(204);
    const view = await detail(clinician, referralId);
    expect(view.status).toBe('CANCELLED');
    expect(view.requests.every((r) => r.status === 'WITHDRAWN')).toBe(true);
    await clinician
      .post(`/api/referrals/${referralId}/cancel`)
      .send({ reason: 'Again' })
      .expect(409);
  });

  it('does not refer a patient to the referring facility itself', async () => {
    const draft = await createDraft();
    await clinician
      .post(`/api/referrals/${draft.id}/submit`)
      .send({ institutionIds: [ids.north] })
      .expect(400);
  });
});

describe('early-warning score applicability', () => {
  it('does not calculate a score in pregnancy and says why', async () => {
    const draft = await createDraft({ pregnancyStatus: 'PREGNANT', gestationWeeks: 34 });
    const res = await clinician
      .post(`/api/referrals/${draft.id}/assessments`)
      .send({ respiratoryRate: 24, heartRate: 120, systolicBp: 150, temperature: 37 });
    expect(res.status).toBe(201);
    expect(res.body.score).toMatchObject({ total: null });
    expect(res.body.scoreNote).toMatch(/pregnancy/);
  });

  it('reports which observations are missing instead of a partial total', async () => {
    const draft = await createDraft();
    const res = await clinician
      .post(`/api/referrals/${draft.id}/assessments`)
      .send({ heartRate: 120 });
    expect(res.body.score.total).toBeNull();
    expect(res.body.scoreNote).toMatch(/respiratory rate/);
  });

  it('rejects implausible values', async () => {
    const draft = await createDraft();
    await clinician
      .post(`/api/referrals/${draft.id}/assessments`)
      .send({ oxygenSaturation: 980 })
      .expect(400);
  });
});

describe('attachments', () => {
  let referralId: string;
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF');

  beforeAll(async () => {
    referralId = (await createDraft()).id;
    await clinician
      .post(`/api/referrals/${referralId}/submit`)
      .send({ institutionIds: [ids.national] })
      .expect(204);
  });

  it('accepts PDFs and serves them only to people involved', async () => {
    const upload = await clinician
      .post(`/api/referrals/${referralId}/attachments`)
      .attach('file', pdf, {
        filename: '../../chest x-ray report.pdf',
        contentType: 'application/pdf',
      });
    expect(upload.status, JSON.stringify(upload.body)).toBe(201);
    expect(upload.body).toMatchObject({
      fileName: 'chest x-ray report.pdf',
      contentType: 'application/pdf',
    });

    const download = await national.get(`/api/attachments/${upload.body.id}`);
    expect(download.status).toBe(200);
    expect(download.headers['cache-control']).toBe('no-store');
    expect(download.headers['content-disposition']).toMatch(/^attachment;/);
    expect(Buffer.from(download.body as Buffer).equals(pdf)).toBe(true);

    await ambulanceAdmin.get(`/api/attachments/${upload.body.id}`).expect(404);
  });

  it('rejects files that are not really PDF, JPEG or PNG', async () => {
    const res = await clinician
      .post(`/api/referrals/${referralId}/attachments`)
      .attach('file', Buffer.from('MZ\x90\x00 not a pdf'), {
        filename: 'notes.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(400);
  });
});
