# Lifeline

Healthcare referral and transfer coordination. Connected care. Coordinated transfers.

- Product context: [problem-statement.md](docs/problem-statement.md)
- Delivery plan: [docs/implementation-plan.md](docs/implementation-plan.md)
- Phase records: [Phase 0 — foundations](docs/phase-0-foundations.md), [Phase 1 — facility network and capacity](docs/phase-1-facility-capacity.md)
- Brand: [lifeline-brand-guidelines.md](docs/lifeline-brand-guidelines.md)

## Repository layout

```
apps/
  api/        NestJS API (modular monolith), Prisma + PostgreSQL
  web/        Next.js web app for facilities, dispatch, operations and admin
packages/
  domain/     Roles, permissions and scope rules shared by API and web
  schemas/    Zod request schemas and API response types
  tokens/     Brand design tokens (TypeScript + Tailwind theme)
  ui/         Shared React components (buttons, fields, status chips, …)
infra/        Docker Compose for local Postgres (PostGIS) and Redis
```

## Prerequisites

- Node.js 24 (`.nvmrc`)
- pnpm 11 (`corepack enable` picks up the version in `package.json`)
- Docker Desktop

## First-time setup

```sh
pnpm install
pnpm infra:up                       # Postgres on localhost:5442, Redis on localhost:6380
cp .env.example apps/api/.env       # then replace JWT_SECRET and MFA_ENCRYPTION_KEY (commands are in the file)
pnpm --filter "./packages/*" build
pnpm db:migrate                     # applies migrations to the development database
pnpm db:seed                        # loads the demo network
```

## Running locally

```sh
pnpm dev
```

- Web app: <http://localhost:3000>
- API: <http://localhost:4000/api> (the web app proxies `/api` to it, so cookies stay first-party)

### Demo accounts

All demo users share the password in `SEED_DEMO_PASSWORD` (default `Lifeline-Demo-2026`). Names and institutions are fictional.

| Email | Role | Where |
|---|---|---|
| clinician.north@demo.lifeline.test | Referring clinician | Demo Sub-County Hospital North |
| coordinator.north@demo.lifeline.test | Referral coordinator | Demo Sub-County Hospital North |
| admin.north@demo.lifeline.test | Facility administrator ¹ | Demo Sub-County Hospital North |
| receiving.national@demo.lifeline.test | Receiving decision-maker | Demo National Referral Hospital |
| admin.national@demo.lifeline.test | Facility administrator ¹ | Demo National Referral Hospital |
| dispatcher@demo.lifeline.test | Dispatcher | Demo Ambulance Services |
| crew@demo.lifeline.test | Ambulance crew | Demo Ambulance Services |
| admin.ambulance@demo.lifeline.test | Provider administrator ¹ | Demo Ambulance Services |
| operations@demo.lifeline.test | Network operations | Whole network |
| network.admin@demo.lifeline.test | Network administrator ¹ | Whole network |
| auditor@demo.lifeline.test | Auditor ¹ | Whole network |

¹ Requires two-step verification. At first sign-in you'll be asked to scan a QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, …).

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test            # unit tests
pnpm test:e2e        # API end-to-end tests (needs `pnpm infra:up`)
pnpm format:check
```

The end-to-end suite migrates a fresh `e2e_<timestamp>` schema in the `lifeline_test` database for each run and drops only that schema afterwards. It never resets or alters existing data. Set `TEST_DATABASE_URL` to point it elsewhere.

CI (`.github/workflows/ci.yml`) runs all of the above on every push and pull request.

## Database changes

```sh
# edit apps/api/prisma/schema.prisma, then:
pnpm db:migrate --name describe_the_change
```

Review the generated SQL in `apps/api/prisma/migrations/` before committing. `pnpm db:reset` wipes the development database. Never run it against shared or production data.
