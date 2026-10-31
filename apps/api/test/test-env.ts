/** Test-only settings. The suite uses its own database and never touches the development one. */
export const TEST_DATABASE_BASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifeline:lifeline@localhost:5442/lifeline_test';

export const TEST_ENV = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-only-jwt-secret-that-is-long-enough-0123456789',
  MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  WEB_ORIGIN: 'http://localhost:3000',
  COOKIE_SECURE: 'false',
};

export const TEST_PASSWORD = 'Test-Password-2026';
