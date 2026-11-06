import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/passwords';
import { generateTotp, timeStep } from '../src/auth/totp';
import { cookieFrom, createApp, demoIds, nextTotpCode, prismaOf, signIn } from './helpers';
import { TEST_PASSWORD } from './test-env';

let app: INestApplication;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  app = await createApp();
});

afterAll(async () => {
  await app.close();
});

async function createTestUser(
  email: string,
  options: {
    mustChangePassword?: boolean;
    role?: 'REFERRING_CLINICIAN' | 'FACILITY_ADMIN';
  } = {},
) {
  const ids = await demoIds(app);
  return prismaOf(app).user.create({
    data: {
      email,
      fullName: 'Test User',
      passwordHash: await hashPassword(TEST_PASSWORD),
      mustChangePassword: options.mustChangePassword ?? false,
      memberships: {
        create: {
          networkId: ids.networkId,
          institutionId: ids.north,
          role: options.role ?? 'REFERRING_CLINICIAN',
        },
      },
    },
  });
}

describe('password sign-in', () => {
  it('signs a clinician straight in and sets session cookies', async () => {
    const res = await http()
      .post('/api/auth/login')
      .send({ email: 'clinician.north@demo.lifeline.test', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.step).toBe('AUTHENTICATED');
    expect(res.body.user.permissions).toContain('referral:create');
    expect(res.body.user.permissions).not.toContain('users:manage');
    expect(cookieFrom(res, 'll_at')).toBeTruthy();
    expect(cookieFrom(res, 'll_rt')).toBeTruthy();
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrong = await http()
      .post('/api/auth/login')
      .send({ email: 'clinician.north@demo.lifeline.test', password: 'not-the-password' });
    const unknown = await http()
      .post('/api/auth/login')
      .send({ email: 'nobody@demo.lifeline.test', password: 'x' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('rejects malformed input with field errors', async () => {
    const res = await http().post('/api/auth/login').send({ email: 'not-an-email', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { path: string }) => e.path)).toEqual(
      expect.arrayContaining(['email', 'password']),
    );
  });

  it('locks the account after five failures, even for the right password', async () => {
    await createTestUser('lockout@demo.lifeline.test');
    for (let i = 0; i < 5; i++) {
      await http()
        .post('/api/auth/login')
        .send({ email: 'lockout@demo.lifeline.test', password: 'wrong-password' });
    }
    const res = await http()
      .post('/api/auth/login')
      .send({ email: 'lockout@demo.lifeline.test', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Too many unsuccessful attempts/);
  });

  it('does not let a deactivated user sign in', async () => {
    const user = await createTestUser('inactive@demo.lifeline.test');
    await prismaOf(app).user.update({ where: { id: user.id }, data: { status: 'DEACTIVATED' } });
    const res = await http()
      .post('/api/auth/login')
      .send({ email: 'inactive@demo.lifeline.test', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Email or password is incorrect.');
  });
});

describe('first sign-in with a temporary password', () => {
  it('requires a new, different password before issuing a session', async () => {
    await createTestUser('newstarter@demo.lifeline.test', { mustChangePassword: true });
    const login = await http()
      .post('/api/auth/login')
      .send({ email: 'newstarter@demo.lifeline.test', password: TEST_PASSWORD });
    expect(login.body.step).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(cookieFrom(login, 'll_at')).toBeUndefined();

    const same = await http()
      .post('/api/auth/password/initial')
      .send({ challengeToken: login.body.challengeToken, newPassword: TEST_PASSWORD });
    expect(same.status).toBe(400);

    const changed = await http()
      .post('/api/auth/password/initial')
      .send({ challengeToken: login.body.challengeToken, newPassword: 'A-brand-new-password-1' });
    expect(changed.body.step).toBe('AUTHENTICATED');

    const reuse = await http()
      .post('/api/auth/password/initial')
      .send({ challengeToken: login.body.challengeToken, newPassword: 'Another-new-password-2' });
    expect(reuse.status).toBe(401);
  });
});

describe('two-step verification', () => {
  const email = 'mfaadmin@demo.lifeline.test';

  it('makes administrators enrol before they get a session', async () => {
    await createTestUser(email, { role: 'FACILITY_ADMIN' });
    const login = await http().post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(login.body.step).toBe('MFA_SETUP_REQUIRED');
    const { challengeToken } = login.body as { challengeToken: string };

    // A challenge token is not an access token.
    const me = await http().get('/api/auth/me').set('authorization', `Bearer ${challengeToken}`);
    expect(me.status).toBe(401);

    const setup = await http().post('/api/auth/mfa/setup').send({ challengeToken });
    expect(setup.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(setup.body.otpauthUrl).toContain('issuer=Lifeline');

    // Reloading the setup screen shows the same secret the user may already have scanned.
    const repeated = await http().post('/api/auth/mfa/setup').send({ challengeToken });
    expect(repeated.body.secret).toBe(setup.body.secret);

    const current = generateTotp(setup.body.secret, timeStep(Date.now()));
    const wrongCode = current === '123456' ? '654321' : '123456';
    const wrong = await http()
      .post('/api/auth/mfa/setup/confirm')
      .send({ challengeToken, code: wrongCode });
    expect(wrong.status).toBe(400);

    const confirmed = await http()
      .post('/api/auth/mfa/setup/confirm')
      .send({ challengeToken, code: current });
    expect(confirmed.body.step).toBe('AUTHENTICATED');
    expect(confirmed.body.user.mfaEnabled).toBe(true);
  });

  it('asks enrolled users for a code and refuses a replayed one', async () => {
    const login = await http().post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(login.body.step).toBe('MFA_REQUIRED');

    const code = await nextTotpCode(app, email);
    const ok = await http()
      .post('/api/auth/mfa/verify')
      .send({ challengeToken: login.body.challengeToken, code });
    expect(ok.body.step).toBe('AUTHENTICATED');

    const again = await http().post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    const replay = await http()
      .post('/api/auth/mfa/verify')
      .send({ challengeToken: again.body.challengeToken, code });
    expect(replay.status).toBe(401);
  });

  it('does not accept a challenge token from a different step', async () => {
    const login = await http().post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    const res = await http()
      .post('/api/auth/mfa/setup')
      .send({ challengeToken: login.body.challengeToken });
    expect(res.status).toBe(401);
  });
});

describe('sessions', () => {
  const email = 'coordinator.north@demo.lifeline.test';

  it('rotates the refresh token and ends the session if an old one is reused', async () => {
    const login = await http().post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    const firstRefresh = cookieFrom(login, 'll_rt')!;

    const refreshed = await http().post('/api/auth/refresh').set('cookie', `ll_rt=${firstRefresh}`);
    expect(refreshed.status).toBe(204);
    const secondRefresh = cookieFrom(refreshed, 'll_rt')!;
    const secondAccess = cookieFrom(refreshed, 'll_at')!;
    expect(secondRefresh).not.toBe(firstRefresh);

    // Within the grace window a concurrent tab may still present the old token.
    const grace = await http().post('/api/auth/refresh').set('cookie', `ll_rt=${firstRefresh}`);
    expect(grace.status).toBe(204);
    expect(cookieFrom(grace, 'll_rt')).toBeUndefined();

    // After the grace window, reuse means the token was copied: the whole session ends.
    const sessionId = firstRefresh.split('.')[0]!;
    await prismaOf(app).session.update({
      where: { id: sessionId },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });
    const reuse = await http().post('/api/auth/refresh').set('cookie', `ll_rt=${firstRefresh}`);
    expect(reuse.status).toBe(401);

    const me = await http().get('/api/auth/me').set('cookie', `ll_at=${secondAccess}`);
    expect(me.status).toBe(401);
    const event = await prismaOf(app).auditEvent.findFirst({
      where: { action: 'auth.session.token_reuse_detected', entityId: sessionId },
    });
    expect(event).not.toBeNull();
  });

  it('ends the session on logout even though the access token has not expired', async () => {
    const { agent } = await signIn(app, email);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);

    const login = await http().post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    const access = cookieFrom(login, 'll_at')!;
    await http().post('/api/auth/logout').set('cookie', `ll_at=${access}`).expect(204);
    await http().get('/api/auth/me').set('cookie', `ll_at=${access}`).expect(401);

    // Other sessions are unaffected.
    await agent.get('/api/auth/me').expect(200);
  });

  it('signs out other devices when the password changes', async () => {
    await createTestUser('changer@demo.lifeline.test');
    const phone = await signIn(app, 'changer@demo.lifeline.test');
    const laptop = await signIn(app, 'changer@demo.lifeline.test');

    await laptop.agent
      .post('/api/auth/password/change')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'Changed-password-2026' })
      .expect(204);

    await laptop.agent.get('/api/auth/me').expect(200);
    await phone.agent.get('/api/auth/me').expect(401);
  });
});
