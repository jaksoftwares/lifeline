import { type INestApplication } from '@nestjs/common';
import { type UserSummary } from '@lifeline/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Agent, createApp, demoIds, prismaOf, signIn } from './helpers';

let app: INestApplication;
let ids: Awaited<ReturnType<typeof demoIds>>;
let northAdmin: Agent;
let networkAdmin: Agent;
let clinician: Agent;
let auditor: Agent;

beforeAll(async () => {
  app = await createApp();
  ids = await demoIds(app);
  northAdmin = (await signIn(app, 'admin.north@demo.lifeline.test')).agent;
  networkAdmin = (await signIn(app, 'network.admin@demo.lifeline.test')).agent;
  clinician = (await signIn(app, 'clinician.north@demo.lifeline.test')).agent;
  auditor = (await signIn(app, 'auditor@demo.lifeline.test')).agent;
});

afterAll(async () => {
  await app.close();
});

const newUser = (email: string, role: string, institutionId: string | null) => ({
  fullName: 'Wairimu Test',
  email,
  phone: '+254712000000',
  temporaryPassword: 'Temporary-password-1',
  membership: { networkId: ids.networkId, institutionId, role },
});

describe('user list scoping', () => {
  it('shows a facility admin only people at their facility', async () => {
    const res = await northAdmin.get('/api/users').query({ networkId: ids.networkId });
    expect(res.status).toBe(200);
    const users = res.body as UserSummary[];
    expect(users.map((u) => u.email)).toContain('clinician.north@demo.lifeline.test');
    expect(users.map((u) => u.email)).not.toContain('receiving.national@demo.lifeline.test');
    expect(users.map((u) => u.email)).not.toContain('operations@demo.lifeline.test');
    expect(users.flatMap((u) => u.memberships).every((m) => m.institution?.id === ids.north)).toBe(
      true,
    );
  });

  it('refuses a facility admin another facility', async () => {
    await northAdmin
      .get('/api/users')
      .query({ networkId: ids.networkId, institutionId: ids.national })
      .expect(403);
  });

  it('shows a network admin everyone in the network', async () => {
    const res = await networkAdmin.get('/api/users').query({ networkId: ids.networkId });
    const emails = (res.body as UserSummary[]).map((u) => u.email);
    expect(emails).toEqual(
      expect.arrayContaining([
        'receiving.national@demo.lifeline.test',
        'operations@demo.lifeline.test',
        'crew@demo.lifeline.test',
      ]),
    );
  });

  it('refuses users without user management', async () => {
    await clinician.get('/api/users').query({ networkId: ids.networkId }).expect(403);
  });

  it('refuses requests outside the user’s network', async () => {
    await networkAdmin.get('/api/users').query({ networkId: 'some-other-network' }).expect(403);
  });
});

describe('granting roles', () => {
  it('lets a facility admin add staff at their own facility', async () => {
    const res = await northAdmin
      .post('/api/users')
      .send(newUser('nurse.new@demo.lifeline.test', 'REFERRING_CLINICIAN', ids.north));
    expect(res.status).toBe(201);
    expect(res.body.memberships[0].role).toBe('REFERRING_CLINICIAN');
    const stored = await prismaOf(app).user.findUniqueOrThrow({
      where: { email: 'nurse.new@demo.lifeline.test' },
    });
    expect(stored.mustChangePassword).toBe(true);
    expect(stored.passwordHash).not.toContain('Temporary');
  });

  it('stops a facility admin adding staff elsewhere or granting network roles', async () => {
    await northAdmin
      .post('/api/users')
      .send(newUser('a@demo.lifeline.test', 'REFERRING_CLINICIAN', ids.national))
      .expect(403);
    await northAdmin
      .post('/api/users')
      .send(newUser('b@demo.lifeline.test', 'NETWORK_OPERATIONS', null))
      .expect(403);
  });

  it('rejects a role that does not fit the institution', async () => {
    const res = await networkAdmin
      .post('/api/users')
      .send(newUser('c@demo.lifeline.test', 'DISPATCHER', ids.north));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Dispatcher can only be held at an? ambulance provider/);
  });

  it('lets a network admin add staff anywhere in the network', async () => {
    await networkAdmin
      .post('/api/users')
      .send(newUser('dispatch.two@demo.lifeline.test', 'DISPATCHER', ids.ambulance))
      .expect(201);
  });

  it('rejects duplicate emails', async () => {
    const res = await networkAdmin
      .post('/api/users')
      .send(newUser('crew@demo.lifeline.test', 'AMBULANCE_CREW', ids.ambulance));
    expect(res.status).toBe(409);
  });

  it('adds and removes a second role', async () => {
    const user = await prismaOf(app).user.findUniqueOrThrow({
      where: { email: 'nurse.new@demo.lifeline.test' },
    });
    const added = await northAdmin
      .post(`/api/users/${user.id}/memberships`)
      .send({ networkId: ids.networkId, institutionId: ids.north, role: 'REFERRAL_COORDINATOR' });
    expect(added.status).toBe(201);
    const membership = (added.body as UserSummary).memberships.find(
      (m) => m.role === 'REFERRAL_COORDINATOR',
    )!;

    await northAdmin
      .post(`/api/users/${user.id}/memberships`)
      .send({ networkId: ids.networkId, institutionId: ids.north, role: 'REFERRAL_COORDINATOR' })
      .expect(409);
    await northAdmin.delete(`/api/memberships/${membership.id}`).expect(204);
  });

  it('stops admins removing their own admin role', async () => {
    const me = await northAdmin.get('/api/auth/me');
    const adminRole = me.body.memberships.find(
      (m: { role: string }) => m.role === 'FACILITY_ADMIN',
    );
    const res = await northAdmin.delete(`/api/memberships/${adminRole.id}`);
    expect(res.status).toBe(400);
  });
});

describe('deactivation', () => {
  it('lets a facility admin deactivate and reactivate their own staff', async () => {
    const user = await prismaOf(app).user.findUniqueOrThrow({
      where: { email: 'nurse.new@demo.lifeline.test' },
    });
    await northAdmin.post(`/api/users/${user.id}/deactivate`).expect(204);
    expect((await prismaOf(app).user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe(
      'DEACTIVATED',
    );
    await northAdmin.post(`/api/users/${user.id}/reactivate`).expect(204);
  });

  it('refuses when the person also holds roles the admin does not manage', async () => {
    const user = await prismaOf(app).user.findUniqueOrThrow({
      where: { email: 'nurse.new@demo.lifeline.test' },
    });
    await networkAdmin
      .post(`/api/users/${user.id}/memberships`)
      .send({ networkId: ids.networkId, institutionId: ids.south, role: 'REFERRING_CLINICIAN' })
      .expect(201);
    const res = await northAdmin.post(`/api/users/${user.id}/deactivate`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/roles you don’t manage/);
  });

  it('ends a deactivated user’s existing sessions immediately', async () => {
    const created = await networkAdmin
      .post('/api/users')
      .send(newUser('leaver@demo.lifeline.test', 'REFERRING_CLINICIAN', ids.south));
    const leaver = await signIn(app, 'leaver@demo.lifeline.test', {
      password: 'Temporary-password-1',
      newPassword: 'Leaver-password-2026',
    });
    await leaver.agent.get('/api/auth/me').expect(200);
    await networkAdmin.post(`/api/users/${created.body.id}/deactivate`).expect(204);
    await leaver.agent.get('/api/auth/me').expect(401);
  });
});

describe('institution directory', () => {
  it('shows every network member the whole directory', async () => {
    const res = await clinician.get(`/api/networks/${ids.networkId}/institutions`);
    expect(res.status).toBe(200);
    // Other test files may add institutions to the shared test network, so check the seeded ones.
    const codes = (res.body as { code: string }[]).map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining(['DNRH', 'DCRH-E', 'DCRH-W', 'DSCH-N', 'DSCH-S', 'DAS']),
    );
  });

  it('refuses non-members', async () => {
    await clinician.get('/api/networks/some-other-network/institutions').expect(403);
  });
});

describe('audit log', () => {
  it('records administrative actions for network-wide viewers', async () => {
    const res = await auditor
      .get('/api/audit-events')
      .query({ networkId: ids.networkId, limit: 100 });
    expect(res.status).toBe(200);
    const actions = res.body.items.map((e: { action: string }) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'user.created',
        'membership.granted',
        'user.deactivated',
        'auth.login.succeeded',
      ]),
    );
  });

  it('limits a facility admin to their facility', async () => {
    const res = await northAdmin
      .get('/api/audit-events')
      .query({ networkId: ids.networkId, limit: 100 });
    expect(res.status).toBe(200);
    const institutionIds = res.body.items
      .map((e: { institution: { id: string } | null }) => e.institution?.id)
      .filter(Boolean);
    expect(new Set(institutionIds)).toEqual(new Set([ids.north]));
  });

  it('pages with a cursor', async () => {
    const first = await auditor
      .get('/api/audit-events')
      .query({ networkId: ids.networkId, limit: 2 });
    expect(first.body.items).toHaveLength(2);
    const second = await auditor
      .get('/api/audit-events')
      .query({ networkId: ids.networkId, limit: 2, cursor: first.body.nextCursor });
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
  });

  it('refuses users without audit access', async () => {
    await clinician.get('/api/audit-events').query({ networkId: ids.networkId }).expect(403);
  });

  it('cannot be altered or deleted, even directly in the database', async () => {
    const prisma = prismaOf(app);
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "AuditEvent" SET action = 'tampered'`),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "AuditEvent"`)).rejects.toThrow(
      /append-only/,
    );
  });
});
