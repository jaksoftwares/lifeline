import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { type TestProject } from 'vitest/node';
import { seed } from '../prisma/seed';
import { TEST_DATABASE_BASE_URL, TEST_ENV, TEST_PASSWORD } from './test-env';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Each run migrates a brand-new schema and drops only that schema afterwards, so the suite never
 * runs a destructive command against existing data, whatever TEST_DATABASE_URL points at.
 */
export default async function setup(project: TestProject) {
  const schema = `e2e_${Date.now()}`;
  const url = new URL(TEST_DATABASE_BASE_URL);
  url.searchParams.set('schema', schema);
  const databaseUrl = url.toString();

  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, ...TEST_ENV, DATABASE_URL: databaseUrl },
  });

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  await seed(prisma, TEST_PASSWORD);
  project.provide('databaseUrl', databaseUrl);

  return async () => {
    try {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await prisma.$disconnect();
    }
  };
}
