// Database helper for Afyaline.
//
//   pnpm db:push   apply supabase/migrations/*.sql to your Supabase database
//   pnpm db:seed   load demo organizations, users, ambulances and transfers
//
// Reads SUPABASE_DB_URL (and the Supabase keys for seeding) from .env.local.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadEnv('.env.local');

const command = process.argv[2];

if (command === 'push') {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error(`
SUPABASE_DB_URL is missing from .env.local.

Get it from Supabase → your project → "Connect" (top bar) → "Session pooler",
replace [YOUR-PASSWORD] with your database password, and add:

  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres

Alternative without the CLI: paste supabase/migrations/*.sql into the Supabase SQL Editor, in order.
`);
    process.exit(1);
  }
  // Run the CLI through Node directly (no shell), so passwords with special characters are safe.
  const cli = 'node_modules/supabase/dist/supabase.js';
  const result = spawnSync(process.execPath, [cli, 'db', 'push', `--remote=${dbUrl}`], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
} else if (command === 'seed') {
  await import('./seed.mjs');
} else {
  console.error('Usage: node scripts/db.mjs <push|seed>');
  process.exit(1);
}
