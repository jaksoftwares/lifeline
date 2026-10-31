import { existsSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters.'),
  MFA_ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'MFA_ENCRYPTION_KEY must be 32 bytes, base64-encoded.',
    ),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  /** Defaults to true in production. Browsers reject Secure cookies over plain HTTP in local development. */
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  // Existing environment variables take precedence over the file.
  if (existsSync('.env')) process.loadEnvFile('.env');
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}

@Injectable()
export class AppConfig {
  readonly env = loadEnv();
  readonly mfaKey = Buffer.from(this.env.MFA_ENCRYPTION_KEY, 'base64');
  readonly cookieSecure =
    this.env.COOKIE_SECURE !== undefined
      ? this.env.COOKIE_SECURE === 'true'
      : this.env.NODE_ENV === 'production';
  readonly isTest = this.env.NODE_ENV === 'test';
}
