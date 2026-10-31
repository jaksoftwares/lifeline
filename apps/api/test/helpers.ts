import { type INestApplication } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { type AuthStepResponse, type CurrentUser } from '@lifeline/schemas';
import request from 'supertest';
import { expect } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { decryptSecret } from '../src/auth/crypto';
import { generateTotp, timeStep } from '../src/auth/totp';
import { PrismaService } from '../src/prisma/prisma.service';
import { TEST_ENV, TEST_PASSWORD } from './test-env';

export type Agent = ReturnType<typeof request.agent>;

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

export function prismaOf(app: INestApplication): PrismaService {
  return app.get(PrismaService);
}

const mfaKey = Buffer.from(TEST_ENV.MFA_ENCRYPTION_KEY, 'base64');

/**
 * A valid TOTP code for an enrolled user that the server has not yet accepted. Reads the secret and
 * last used step from the database, waiting for the next 30-second step if needed.
 */
export async function nextTotpCode(app: INestApplication, email: string): Promise<string> {
  const user = await prismaOf(app).user.findUniqueOrThrow({ where: { email } });
  if (!user.mfaSecret) throw new Error(`${email} has no MFA secret`);
  const secret = decryptSecret(user.mfaSecret, mfaKey);
  for (;;) {
    const current = timeStep(Date.now());
    for (let step = current - 1; step <= current + 1; step++) {
      if (user.mfaLastUsedStep === null || step > user.mfaLastUsedStep)
        return generateTotp(secret, step);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** Signs in through every required step and returns a cookie-carrying agent. */
export async function signIn(
  app: INestApplication,
  email: string,
  options: { password?: string; newPassword?: string } = {},
): Promise<{ agent: Agent; user: CurrentUser }> {
  const agent = request.agent(app.getHttpServer());
  let res = await agent
    .post('/api/auth/login')
    .send({ email, password: options.password ?? TEST_PASSWORD });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  let body = res.body as AuthStepResponse;

  for (let guard = 0; body.step !== 'AUTHENTICATED'; guard++) {
    if (guard > 3) throw new Error('Too many sign-in steps');
    if (body.step === 'PASSWORD_CHANGE_REQUIRED') {
      if (!options.newPassword) throw new Error(`${email} must change password; pass newPassword`);
      res = await agent
        .post('/api/auth/password/initial')
        .send({ challengeToken: body.challengeToken, newPassword: options.newPassword });
    } else if (body.step === 'MFA_SETUP_REQUIRED') {
      const setup = await agent
        .post('/api/auth/mfa/setup')
        .send({ challengeToken: body.challengeToken });
      expect(setup.status).toBe(200);
      const code = generateTotp(setup.body.secret as string, timeStep(Date.now()));
      res = await agent
        .post('/api/auth/mfa/setup/confirm')
        .send({ challengeToken: body.challengeToken, code });
    } else {
      res = await agent
        .post('/api/auth/mfa/verify')
        .send({ challengeToken: body.challengeToken, code: await nextTotpCode(app, email) });
    }
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    body = res.body as AuthStepResponse;
  }
  return { agent, user: body.user };
}

/** Extracts a cookie value from a response's Set-Cookie headers. */
export function cookieFrom(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const match = raw?.find((c) => c.startsWith(`${name}=`));
  return match?.split(';')[0]?.slice(name.length + 1);
}

export async function demoIds(app: INestApplication) {
  const prisma = prismaOf(app);
  const network = await prisma.network.findUniqueOrThrow({ where: { code: 'DEMO' } });
  const institutions = await prisma.institution.findMany({ where: { networkId: network.id } });
  const byCode = (code: string) => institutions.find((i) => i.code === code)!.id;
  return {
    networkId: network.id,
    national: byCode('DNRH'),
    north: byCode('DSCH-N'),
    south: byCode('DSCH-S'),
    ambulance: byCode('DAS'),
  };
}
