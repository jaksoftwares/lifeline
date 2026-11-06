# Lifeline

Healthcare referral and transfer coordination. Connected care. Coordinated transfers.

- Product context: [problem-statement.md](docs/problem-statement.md)
- Delivery plan: [docs/implementation-plan.md](docs/implementation-plan.md)
- Phase records: [Phase 0 — foundations](docs/phase-0-foundations.md), [Phase 1 — facility network and capacity](docs/phase-1-facility-capacity.md), [Phase 2 — referrals](docs/phase-2-referrals.md), [Phase 3 — ambulances and dispatch](docs/phase-3-ambulances-dispatch.md), [Phase 4 — crew app](docs/phase-4-crew-app.md), [Phase 5 — live tracking](docs/phase-5-live-tracking.md), [Phase 6 — handover and costs](docs/phase-6-handover-costs.md), [Phase 7 — notifications and escalations](docs/phase-7-notifications.md), [Phase 8 — reports and administration](docs/phase-8-reports-admin.md)
- Demo: [MVP presenter guide](docs/mvp-demo-guide.md)
- Brand: [lifeline-brand-guidelines.md](docs/lifeline-brand-guidelines.md)

## Repository layout

```
apps/
  api/        NestJS API (modular monolith), Prisma + PostgreSQL
  web/        Next.js web app for facilities, dispatch, operations and admin
  mobile/     Expo (React Native) crew app: trips, status updates offline, location sharing
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

All demo users share the password in `SEED_DEMO_PASSWORD` (default `Lifeline-Demo-2026`). Facility names are real Nairobi hospitals; contacts, capacity, and referral data are illustrative and must not be used for care decisions.

Email notifications use Postmark when `POSTMARK_SERVER_TOKEN` and `POSTMARK_FROM_EMAIL` are set in the API environment. SMS and push delivery remain unconfigured. Keep provider credentials in deployment secrets.

| Email | Role | Where |
|---|---|---|
| clinician.north@demo.lifeline.test | Referring clinician | Pumwani Maternity Hospital |
| coordinator.north@demo.lifeline.test | Referral coordinator | Pumwani Maternity Hospital |
| admin.north@demo.lifeline.test | Facility administrator ¹ | Pumwani Maternity Hospital |
| receiving.national@demo.lifeline.test | Receiving decision-maker | Kenyatta National Hospital (KNH) |
| admin.national@demo.lifeline.test | Facility administrator ¹ | Kenyatta National Hospital (KNH) |
| receiving.east@demo.lifeline.test | Receiving decision-maker | Mama Lucy Kibaki Hospital |
| receiving.west@demo.lifeline.test | Receiving decision-maker | Mbagathi County Hospital |
| dispatcher@demo.lifeline.test | Dispatcher | Demo Ambulance Services |
| dispatcher.county@demo.lifeline.test | Dispatcher | Demo County Ambulance Service |
| crew@demo.lifeline.test | Ambulance crew | Demo Ambulance Services |
| admin.ambulance@demo.lifeline.test | Provider administrator ¹ | Demo Ambulance Services |
| operations@demo.lifeline.test | Network operations | Whole network |
| network.admin@demo.lifeline.test | Network administrator ¹ | Whole network |
| auditor@demo.lifeline.test | Auditor ¹ | Whole network |

¹ Requires two-step verification. At first sign-in you'll be asked to scan a QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, …).

The seed creates an emergency referral from Pumwani to KNH and an urgent referral accepted by Mama Lucy, ready for transport. Seeded clinical, capacity, contact, and vehicle data are illustrative. Vehicle availability expires after 12 hours; dispatchers can confirm it on the Fleet page. The demo network uses NEWS2; real networks start with no score until approved by clinical governance.

## Crew app

The crew app runs as an Expo development build (background location needs native configuration). With the API running:

```sh
cd apps/mobile
npx expo run:android
```

The emulator reaches the API at `10.0.2.2:4000`. For a phone on your Wi-Fi, set `EXPO_PUBLIC_API_URL=http://<your computer's IP>:4000/api`. Sign in as `crew@demo.lifeline.test`. See [docs/phase-4-crew-app.md](docs/phase-4-crew-app.md).

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
