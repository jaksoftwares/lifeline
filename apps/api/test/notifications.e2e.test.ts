import { type INestApplication } from '@nestjs/common';
import { type NotificationView } from '@lifeline/schemas';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../src/notifications/notifications.service';
import { type Agent, createApp, demoIds, prismaOf, signIn } from './helpers';

let app: INestApplication;
let ids: Awaited<ReturnType<typeof demoIds>>;
let clinician: Agent;
let receiving: Agent;
let operations: Agent;
let networkAdmin: Agent;
const postmarkRequests: { url: string; init?: RequestInit }[] = [];
const postmarkResponses: Response[] = [];
const originalPostmarkEnvironment = {
  token: process.env.POSTMARK_SERVER_TOKEN,
  from: process.env.POSTMARK_FROM_EMAIL,
};

beforeAll(async () => {
  process.env.POSTMARK_SERVER_TOKEN = 'postmark-test-token';
  process.env.POSTMARK_FROM_EMAIL = 'notifications@example.test';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      postmarkRequests.push({ url: String(input), init });
      return (
        postmarkResponses.shift() ??
        new Response(JSON.stringify({ ErrorCode: 0, Message: 'OK', MessageID: 'test-message' }), {
          status: 200,
        })
      );
    }),
  );
  app = await createApp();
  ids = await demoIds(app);
  clinician = (await signIn(app, 'clinician.north@demo.lifeline.test')).agent;
  receiving = (await signIn(app, 'receiving.national@demo.lifeline.test')).agent;
  operations = (await signIn(app, 'operations@demo.lifeline.test')).agent;
  networkAdmin = (await signIn(app, 'network.admin@demo.lifeline.test')).agent;
});

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
  if (originalPostmarkEnvironment.token === undefined) delete process.env.POSTMARK_SERVER_TOKEN;
  else process.env.POSTMARK_SERVER_TOKEN = originalPostmarkEnvironment.token;
  if (originalPostmarkEnvironment.from === undefined) delete process.env.POSTMARK_FROM_EMAIL;
  else process.env.POSTMARK_FROM_EMAIL = originalPostmarkEnvironment.from;
});

describe('notifications and referral escalations (Phase 7)', () => {
  it('routes by role, tracks channel readiness, and escalates an unanswered request once', async () => {
    const savedSettings = await networkAdmin
      .put('/api/notifications/settings')
      .send({ networkId: ids.networkId, referralEscalationMinutes: 1 })
      .expect(200);
    expect(savedSettings.body.referralEscalationMinutes).toBe(1);

    await operations
      .get('/api/notifications/settings')
      .query({ networkId: ids.networkId })
      .expect(403);

    const created = await clinician.post('/api/referrals').send({
      referringInstitutionId: ids.north,
      patient: { fullName: 'Notification Test', sex: 'UNKNOWN' },
      reason: 'Needs specialist care.',
      clinicalSummary: 'Stable and awaiting assessment.',
      urgency: 'URGENT',
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    await clinician
      .post(`/api/referrals/${created.body.id}/submit`)
      .send({ institutionIds: [ids.national] })
      .expect(204);

    const inbox = await receiving
      .get('/api/notifications')
      .query({ networkId: ids.networkId, unreadOnly: 'true' })
      .expect(200);
    const received = (inbox.body as NotificationView[]).find(
      (notification) =>
        notification.eventType === 'REFERRAL_SUBMITTED' &&
        notification.entityId === created.body.id,
    );
    expect(received).toBeDefined();
    expect(received!.message).not.toContain('Notification Test');
    expect(received!.deliveries).toEqual(
      expect.arrayContaining([
        { channel: 'IN_APP', status: 'DELIVERED', error: null },
        { channel: 'SMS', status: 'UNCONFIGURED', error: null },
        { channel: 'PUSH', status: 'UNCONFIGURED', error: null },
        { channel: 'EMAIL', status: 'PENDING', error: null },
      ]),
    );

    const notifications = app.get(NotificationsService);
    expect(await notifications.processPendingEmailDeliveries()).toBe(1);
    const requestBody = JSON.parse(String(postmarkRequests[0]!.init?.body)) as {
      From: string;
      To: string;
      Subject: string;
      TextBody: string;
      MessageStream: string;
    };
    expect(postmarkRequests[0]!.url).toBe('https://api.postmarkapp.com/email');
    expect(requestBody).toMatchObject({
      From: 'notifications@example.test',
      To: 'receiving.national@demo.lifeline.test',
      Subject: 'Lifeline: New referral received',
      MessageStream: 'outbound',
    });
    expect(new Headers(postmarkRequests[0]!.init?.headers).get('X-Postmark-Server-Token')).toBe(
      'postmark-test-token',
    );
    expect(requestBody.TextBody).toContain(
      'Open Lifeline notifications: http://localhost:3000/notifications',
    );
    expect(requestBody.TextBody).not.toContain('Notification Test');
    const sentInbox = await receiving
      .get('/api/notifications')
      .query({ networkId: ids.networkId })
      .expect(200);
    const sentNotification = (sentInbox.body as NotificationView[]).find(
      (notification) => notification.id === received!.id,
    )!;
    expect(sentNotification.deliveries.find((delivery) => delivery.channel === 'EMAIL')).toEqual({
      channel: 'EMAIL',
      status: 'SENT',
      error: null,
    });

    postmarkResponses.push(
      new Response(JSON.stringify({ ErrorCode: 10, Message: 'Invalid server token' }), {
        status: 401,
      }),
    );
    const failedReferral = await clinician.post('/api/referrals').send({
      referringInstitutionId: ids.north,
      patient: { fullName: 'Failed Email Test', sex: 'UNKNOWN' },
      reason: 'Needs specialist care.',
      clinicalSummary: 'Stable and awaiting assessment.',
      urgency: 'URGENT',
    });
    expect(failedReferral.status).toBe(201);
    await clinician
      .post(`/api/referrals/${failedReferral.body.id}/submit`)
      .send({ institutionIds: [ids.national] })
      .expect(204);
    expect(await notifications.processPendingEmailDeliveries()).toBe(1);
    const failedInbox = await receiving
      .get('/api/notifications')
      .query({ networkId: ids.networkId })
      .expect(200);
    const failedNotification = (failedInbox.body as NotificationView[]).find(
      (notification) => notification.entityId === failedReferral.body.id,
    )!;
    expect(
      failedNotification.deliveries.find((delivery) => delivery.channel === 'EMAIL'),
    ).toMatchObject({
      status: 'FAILED',
      error: 'Postmark rejected the email (HTTP 401, error 10).',
    });

    await clinician
      .get('/api/notifications')
      .query({ networkId: ids.networkId })
      .expect(200)
      .then((response) => {
        expect(
          (response.body as NotificationView[]).some(
            (notification) => notification.id === received!.id,
          ),
        ).toBe(false);
      });
    await clinician.post(`/api/notifications/${received!.id}/read`).expect(404);

    const request = await prismaOf(app).referralRequest.findFirstOrThrow({
      where: { referralId: created.body.id, institutionId: ids.national },
    });
    await prismaOf(app).referralRequest.update({
      where: { id: request.id },
      data: { escalationDueAt: new Date(Date.now() - 1_000) },
    });

    const service = notifications;
    const runs = await Promise.all([
      service.processDueEscalations(),
      service.processDueEscalations(),
    ]);
    expect(runs.reduce((sum, count) => sum + count, 0)).toBeGreaterThan(0);
    await service.processDueEscalations();
    const updatedRequest = await prismaOf(app).referralRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(updatedRequest.escalatedAt).not.toBeNull();
    expect(
      await prismaOf(app).notification.count({
        where: {
          eventType: 'REFERRAL_ESCALATED',
          entityId: created.body.id,
          recipientRole: 'NETWORK_OPERATIONS',
        },
      }),
    ).toBe(1);

    const escalations = await operations
      .get('/api/notifications')
      .query({ networkId: ids.networkId, unreadOnly: 'true' })
      .expect(200);
    expect(
      (escalations.body as NotificationView[]).some(
        (notification) =>
          notification.eventType === 'REFERRAL_ESCALATED' &&
          notification.entityId === created.body.id,
      ),
    ).toBe(true);

    await receiving.post(`/api/notifications/${received!.id}/read`).expect(204);
    await receiving
      .get('/api/notifications')
      .query({ networkId: ids.networkId, unreadOnly: 'true' })
      .expect(200)
      .then((response) => {
        expect(
          (response.body as NotificationView[]).some(
            (notification) => notification.id === received!.id,
          ),
        ).toBe(false);
      });
  });
});
