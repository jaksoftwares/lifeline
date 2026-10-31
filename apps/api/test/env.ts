import { inject } from 'vitest';
import { TEST_ENV } from './test-env';

// Runs in each test worker before the app is created; the per-run schema comes from global setup.
Object.assign(process.env, TEST_ENV, { DATABASE_URL: inject('databaseUrl') });
