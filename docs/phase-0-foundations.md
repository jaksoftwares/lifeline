# Phase 0 — Foundations

**Status:** Complete, pending review\
**Date:** 1 November 2026\
**Plan reference:** [implementation-plan.md](implementation-plan.md), section 7, Phase 0

## Done-when criteria

| Criterion from the plan | Result |
|---|---|
| Users with different roles log in and see only their scope | Met. Verified by 34 API end-to-end tests and a manual run through the web proxy |
| CI passes | Workflow added (`.github/workflows/ci.yml`). All steps pass locally; first GitHub run happens once the repository is pushed |

## What was built

### Monorepo and tooling
- pnpm workspaces + Turborepo; shared TypeScript, ESLint (flat config) and Prettier settings.
- Docker Compose for PostgreSQL 16 + PostGIS (port 5442) and Redis 7 (port 6380; not used until Phase 5/7).
- GitHub Actions: format, build, lint, typecheck, unit tests, API end-to-end tests against a PostGIS service.

### Shared packages
- `@lifeline/domain`: the 10 roles from plan section 2, the permissions each carries, which roles need two-step verification, and the scope rules (network → institution → role). Used by both API and web, so the rules exist once.
- `@lifeline/schemas`: request validation (zod) and response types shared by API and web.
- `@lifeline/tokens`: brand colours, radii, spacing, fonts and layout sizes, plus the Tailwind theme. A test fails if the two drift apart.
- `@lifeline/ui`: Button, Input, Select, Field (visible label, hint, inline error), Card, StatusChip, Alert, EmptyState, Loading, placeholder Logo.

### API (NestJS)
- **Sign-in:** email + password (Argon2id). Generic error for wrong password, unknown email or deactivated account. Lockout for 15 minutes after 5 failures.
- **First sign-in:** users created by an administrator get a temporary password and must choose a new, different one.
- **Two-step verification (TOTP):** required for facility, provider and network administrators and auditors. Secrets are encrypted at rest (AES-256-GCM). Codes cannot be replayed. Implemented directly on Node's crypto and tested against the RFC 6238 reference vectors.
- **Sessions:** 15-minute access token and a refresh token tied to a server-side session, both in httpOnly cookies. Sessions last at most 12 hours (one shift). Refresh tokens rotate on every use; reuse of an old token ends the session and is audited. Every request rechecks the session, so logout, deactivation and password changes take effect immediately. Mobile clients can send a Bearer token instead of cookies.
- **Users and roles:** list, create, add or remove roles, deactivate/reactivate, reset two-step verification. An administrator can only act where they manage users; network roles can only be granted by network administrators; a role must fit the institution type (e.g. a dispatcher only at an ambulance provider). Changes to people who also hold roles elsewhere require someone who manages all of those roles.
- **Network directory:** every member of a network can list its facilities and providers.
- **Audit log:** sign-ins, failures, lockouts, password and two-step changes, user and role changes. Scoped like everything else. Updates, deletes and truncation are blocked by a database trigger.
- Rate limiting (10 sign-in attempts per minute per client, 300 requests per minute overall), Helmet security headers, health check at `/api/health`.

### Web app (Next.js)
- Multi-step sign-in: password → new password (if temporary) → two-step setup with QR code, or code entry.
- App shell following the brand guidelines: navy navigation, teal for selection and primary actions, Inter/Manrope (served from the app, not Google at runtime), mobile menu, skip link, visible focus.
- Pages: Overview (your roles, what's coming), Facility network, Users and roles, Audit log, My account (change password).
- Navigation shows only what the user's roles allow; the API still authorises every request.
- Silent token refresh; expired sessions return to sign-in with a message and the page they were on.
- Times are shown in East Africa Time on every device.
- Security headers (frame denial, no sniffing, referrer policy). Installable web app manifest.

## Decisions taken during Phase 0

| Decision | Reason |
|---|---|
| Pinned to Next.js 15.5, NestJS 11, Prisma 6, TypeScript 5.9 rather than the newest majors (Next 16, Nest 12, Prisma 7/8, TypeScript 7) | Mature, still-maintained releases with well-understood APIs reduce risk for an urgent MVP. Upgrade once the MVP is stable |
| Dependencies must be at least two weeks old; install scripts allowed only for Prisma, SWC and esbuild | Supply-chain precaution, enforced through pnpm settings |
| Primary buttons use Deep Teal (`#086B70`), not Lifeline Teal | Lifeline Teal with white text is about 4.1:1 contrast, below WCAG AA for normal text. Deep Teal is about 6.3:1 |
| Status chips keep dark text, with colour on the border, background and icon | Amber and green text on white fail AA contrast at chip size |
| No "platform administrator" role yet | Not needed until networks are created through the product. Networks are seeded for now |
| `packages/config` and `packages/clinical-scores` from the plan's layout not created yet | Shared config lives at the repository root; clinical scores arrive in Phase 2 |
| End-to-end tests use a throwaway schema per run | Prisma correctly refuses `migrate reset` from automated agents; the suite now never needs a destructive command |
| Postgres on port 5442 | 5433 was already used by another local project |

## Follow-ups (not blocking Phase 1)

1. **Final logo.** The symbol in the app is a placeholder following the brand direction; replace once artwork is approved.
2. **Account lockout can be triggered by anyone who knows an email address.** Acceptable for the pilot; consider per-IP throttling plus CAPTCHA, or notifying administrators, before wider rollout.
3. **Sign-in events for unknown emails** are recorded but not visible in the in-app audit log (no network to scope them to). Make them available to a future platform-level security view.
4. **Recovery codes for two-step verification** are not implemented; lost phones are handled by an administrator reset.
5. **Offline support (service worker)** for the web app is planned with the referral screens in Phase 2.
6. **Hosting and data residency** decision still open (plan section 8).
7. Prisma warns that `package.json#prisma` (seed configuration) moves to `prisma.config.ts` in Prisma 7. Address when upgrading.
