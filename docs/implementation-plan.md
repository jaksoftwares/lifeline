# Lifeline — Implementation Plan

**Status:** Draft for review\
**Date:** 31 October 2026\
**Inputs:** [problem-statement.md](problem-statement.md), [lifeline-brand-guidelines.md](lifeline-brand-guidelines.md)

This plan describes how we will build Lifeline from an empty repository to a pilot-ready MVP. Open questions in the problem statement are deferred to next week's stakeholder meeting; the plan is designed so their answers become configuration, not rewrites.

---

## 1. What we are building

Lifeline is a coordination layer for inter-facility patient referrals and transfers in Kenya. It connects referring facilities, receiving hospitals, ambulance providers and operations teams in one shared workflow:

1. **Capture** — digital referral with patient details, observations, documents and urgency.
2. **Prioritise** — early-warning score and clinician-assigned urgency.
3. **Match & dispatch** — confirmed receiving-facility acceptance and confirmed ambulance assignment.
4. **Track** — dispatch, collection, journey, arrival and handover, with a full audit trail.

Lifeline does not replace hospital information systems, 922 emergency response, ambulance fleet tools or clinical judgement. It suggests; authorised people confirm.

### Pilot context

| Participant | Planned number |
|---|---|
| Anchor institution | 1 (KNH) |
| Level 5 hospitals | 5 |
| Level 4 feeder facilities | ~14 |
| Ambulance providers | To be identified |

Roughly 20 facilities and a small number of providers. This scale shapes the architecture (section 4).

---

## 2. Users and roles

| Role | Belongs to | Key permissions |
|---|---|---|
| Referring clinician | Facility | Create/submit referrals, record observations, request transport, confirm collection |
| Referral coordinator | Facility | Same as clinician minus clinical sign-off; manage referral desk queue |
| Receiving decision-maker | Facility | Accept / decline / request more info (explicitly authorised users only) |
| Facility admin | Facility | Manage facility users, services, departments, capacity |
| Dispatcher | Ambulance provider | Accept/decline transport requests, assign vehicle and crew |
| Ambulance crew | Ambulance provider | Update trip status, share location, confirm arrival |
| Provider admin | Ambulance provider | Manage vehicles, crews, equipment, capabilities |
| Network operations | Network | Monitor all transfers, escalate, reassign, generate reports |
| Network admin | Network | Onboard institutions, configure thresholds and workflows |
| Auditor / viewer | Network | Read-only reports and audit history |

Access is scoped by **network → institution → role**. A user may hold roles at more than one institution.

---

## 3. Functional modules

| Module | MVP scope | Later |
|---|---|---|
| Identity & Access | Users, institutions, roles, MFA for privileged roles, session management | Hospital SSO |
| Facility Management | Facility profile, level, location, services, departments, manual capacity board with timestamp and updater | Automated capacity feeds from HIS |
| Referral Management | Create, submit, send to one or more facilities, respond, more-info loop, withdraw, attachments, message thread | Back-referral (counter-referral) |
| Clinical Assessment | Vital signs, configurable early-warning score, abnormal-value highlighting, clinician-assigned urgency, assessment history | Additional validated scores per clinical governance |
| Ambulance Management | Vehicles, capability level, equipment, crews, availability status | Integration with providers' fleet systems |
| Dispatch Management | Transport request, rule-based ranked suggestions, provider confirmation, reassignment, external transport (922 / county / other) recorded manually | 922 / county dispatch integration |
| Live Tracking | Crew-app GPS, map and non-map timeline, ETA, stale-location warnings | Third-party telematics |
| Communication Centre | In-app, push, SMS and email notifications; escalation timers | WhatsApp channel |
| Handover Management | Arrival confirmation, structured handover checklist, receiving sign-off, transfer completion | — |
| Cost Management | Record cost per trip and payer | Payments, invoicing |
| Analytics & Reporting | Success metrics (section 9), CSV export | Analytics product |
| Administration | Network config, thresholds, audit log viewer | Subscriptions and billing |
| Integration Services | Interfaces only (adapters stubbed) | FHIR R4, HIS/EMR, mapping, 922 |

---

## 4. Architecture

### Approach

A **modular monolith**: one API service with strict module boundaries, one web app, one mobile app, one database. At pilot scale this is simpler to build, deploy and operate than microservices, and modules can be extracted later if load or team structure requires it.

```
                   ┌───────────────────────┐      ┌──────────────────────┐
                   │ Web app (Next.js PWA) │      │ Crew app (Expo / RN) │
                   │ facilities, dispatch, │      │ offline queue, GPS,  │
                   │ operations, admin     │      │ push                 │
                   └──────────┬────────────┘      └──────────┬───────────┘
                              │  HTTPS (REST) + WebSocket    │
                   ┌──────────▼──────────────────────────────▼───────────┐
                   │                 API (NestJS)                         │
                   │  identity · facilities · referrals · clinical ·      │
                   │  ambulances · dispatch · tracking · communication ·  │
                   │  handover · costs · reports · admin · integrations   │
                   └───┬──────────────┬──────────────┬──────────────┬─────┘
                       │              │              │              │
               ┌───────▼──────┐ ┌─────▼─────┐ ┌──────▼─────┐ ┌──────▼───────┐
               │ PostgreSQL + │ │ Redis     │ │ Object     │ │ External:    │
               │ PostGIS      │ │ (pub/sub, │ │ storage    │ │ SMS, push,   │
               │              │ │ BullMQ)   │ │ (documents)│ │ email, maps  │
               └──────────────┘ └───────────┘ └────────────┘ └──────────────┘
```

### Technology stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript throughout | One language; validation and types shared across web, mobile and API |
| Repository | pnpm workspaces + Turborepo | Shared packages, cached builds |
| Web app | Next.js (React), Tailwind CSS, shadcn/ui (Radix), Lucide icons, TanStack Query | Accessible components; brand tokens map directly to Tailwind theme; installable PWA for phones and tablets |
| Mobile (crew) | React Native with Expo | Background location, offline storage, push notifications, over-the-air updates |
| API | NestJS (Node.js) | Module structure, dependency injection, guards for role/institution scoping, WebSocket gateway |
| Validation | Zod (shared package) | Same rules on client and server |
| Database | PostgreSQL 16 + PostGIS | Relational integrity for clinical/operational records; geospatial queries |
| ORM | Prisma (or Drizzle) | Typed queries and migrations |
| Realtime | Socket.IO with Redis adapter | Live status and location updates |
| Background jobs | BullMQ on Redis | Escalation timers, notification retries, stale-data checks |
| Files | S3-compatible object storage | Clinical documents, encrypted at rest, signed URLs |
| SMS | Africa's Talking | Kenyan coverage; fallback for low-connectivity users |
| Push / email | Expo push (FCM/APNs), Postmark or SES | |
| Maps & routing | Mapbox (tiles, geocoding) + OSRM or Mapbox Directions for ETA | |
| Auth | Session/JWT with refresh-token rotation, Argon2 password hashing, TOTP MFA | Behind an interface so SSO (e.g. Keycloak/OIDC) can be added |
| Observability | Sentry, OpenTelemetry, structured JSON logs | |
| Testing | Vitest, Supertest, Playwright, Maestro | |
| CI/CD | GitHub Actions, Docker images | |
| Hosting | Containerised; host to be confirmed (see section 8) | |

### Repository layout

```
lifeline/
├── apps/
│   ├── web/              # Next.js: facility, dispatch, operations, admin
│   ├── mobile/           # Expo: ambulance crew app
│   └── api/              # NestJS modular monolith
├── packages/
│   ├── domain/           # entities, status machines, permission rules
│   ├── schemas/          # Zod schemas shared by all apps
│   ├── clinical-scores/  # early-warning score calculators (pure, versioned, tested)
│   ├── ui/               # shared React components (status chip, timeline, etc.)
│   ├── tokens/           # design tokens from the brand guidelines
│   └── config/           # eslint, tsconfig, tailwind presets
├── brand/                # logo, fonts, guidelines (per brand governance section)
├── docs/
└── infra/                # docker-compose, deployment manifests
```

---

## 5. Domain model

```
Network ──< Institution (type: facility | ambulance_provider)
Facility (Institution) ── level, location, services[], departments[]
          └──< CapacitySnapshot (resource, available, total, updated_by, updated_at, source)
AmbulanceProvider (Institution) ──< Vehicle (capability_level, equipment[], status, last_location)
                                 └──< Crew ──< CrewMember
User ──< Membership (institution, role)

Patient (minimum necessary identifiers and demographics)
Referral ── referring facility, clinician, reason, required services, urgency (clinician-assigned)
   ├──< ClinicalAssessment (vitals, score, score_version, abnormal flags, recorded_by, at)
   ├──< ReferralRequest (one per receiving facility; status, conditions, responder, response time)
   ├──< Attachment, Message
   └── Transfer
         ├──< DispatchAssignment (provider, vehicle, crew, status, confirmed_by)
         ├──< LocationPing (vehicle, lat/lng, accuracy, recorded_at, received_at)
         ├── Handover (checklist, receiving clinician, signed_at)
         └── TransportCost (amount, payer, notes)

StatusEvent (entity, from, to, actor, reason, at)   — append-only audit
Notification (event, recipient, channel, delivery status)
EscalationRule (network, trigger, threshold, target role)
```

### Status machines

Two separate machines, enforced in `packages/domain` and checked on the server.

**Referral request** (one per receiving facility):

```
Draft → Submitted → Awaiting response ─┬→ Accepted
                                       ├→ Declined (reason required)
                                       ├→ More info required → Awaiting response
                                       └→ Withdrawn
```

**Transfer** (starts once a request is accepted):

```
Awaiting transport → Ambulance assigned → Dispatched → At pickup → Patient collected
  → In transit → Arrived → Handed over → Completed

Side states: Reassigned (returns to Ambulance assigned), Interrupted (reason required), Cancelled (reason required)
```

Every transition records actor, time and reason. Only roles permitted for a transition can make it. Acceptance and assignment always require an explicit confirmation by an authorised person.

---

## 6. Key design rules

1. **Platform suggests, people decide.** Facility ranking and ambulance suggestions are explainable (each suggestion shows why) and never auto-confirm.
2. **Clinical score is support, not decision.** The calculated score and the clinician-assigned urgency are stored and displayed separately. Thresholds and score versions are configurable per network and require clinical governance sign-off before activation.
3. **Data freshness is visible.** Capacity, ambulance availability and location always show when and by whom they were last updated; stale data is labelled as stale.
4. **Minimum necessary data.** Users see only what their role and current task require. SMS and push content carry a reference and link, never patient details.
5. **Everything is auditable.** Status changes, views of patient records and administrative actions are logged.
6. **Works on poor connections.** Web app is a PWA with cached shell and retrying writes; crew app queues actions offline and syncs with server-side conflict checks; critical alerts fall back to SMS.
7. **Brand and accessibility.** Tokens from the brand guidelines, WCAG 2.2 AA, status always shown with text and colour, Inter typeface, Lucide icons.

### Transport matching (MVP rules)

1. Filter vehicles by required capability level and equipment.
2. Exclude unavailable vehicles and vehicles with stale status.
3. Rank by estimated time to pickup (routing ETA, not straight-line distance).
4. Show reasons; dispatcher selects; provider confirms.
5. If no match, offer external transport (922 / county / other) recorded manually, and alert network operations.

---

## 7. Delivery phases

Each phase ends with a working, demonstrable slice. Phases 1–8 together are the MVP.

| Phase | Scope | Done when |
|---|---|---|
| **0. Foundations** | Monorepo, CI, linting, Docker dev environment, design tokens and base UI components, auth + MFA, institutions/memberships/roles, permission guards, audit log, seed data for a demo network | Users with different roles log in and see only their scope; CI passes |
| **1. Facilities & capacity** | Facility directory, services, departments, capacity board with timestamps, facility map | A clinician finds suitable facilities by service and travel time |
| **2. Referrals & clinical assessment** | Referral form, vitals and early-warning score, attachments, send to multiple facilities, receiving inbox, accept/decline/more-info, message thread, referral status machine | A referral reaches Accepted with full history |
| **3. Ambulances & dispatch** | Vehicles, crews, capability levels, availability, transport request, ranked suggestions, provider confirmation, reassignment, external transport | A dispatcher assigns and the provider confirms a suitable vehicle |
| **4. Crew mobile app** | Login, assignment inbox, large status actions, offline queue, background GPS, connectivity and permission indicators | Status updates sync correctly after an offline period |
| **5. Live tracking** | Map and timeline views, ETA, stale-location handling, operations overview | All parties see the same live transfer state |
| **6. Handover & costs** | Arrival confirmation, handover checklist, receiving sign-off, completion, trip cost record | Transfer completes with a full audit trail and cost recorded |
| **7. Notifications & escalations** | Notification rules per event and role, SMS/push/email, configurable escalation timers, delivery tracking | An unanswered request escalates to operations automatically |
| **8. Reports & administration** | Success-metric dashboard, CSV export, network configuration, user/institution admin, audit viewer | Pilot baseline metrics can be produced |
| **9. Hardening** | Security review, data protection impact assessment, accessibility audit, load test, backup and restore drill, monitoring alerts, runbooks, training material | Ready for controlled pilot |

### End-to-end acceptance scenario

Automated (Playwright + Maestro) against seed data, run in CI:

1. A clinician at a Level 4 facility creates a referral, records vitals (score calculated), assigns urgency and sends it to two Level 5 hospitals.
2. One hospital requests more information, then declines; the other accepts with conditions.
3. A transport request is raised; the dispatcher picks a suggested vehicle; the provider confirms.
4. The crew app progresses Dispatched → At pickup → Collected → In transit (with location updates and a simulated offline gap) → Arrived.
5. The receiving clinician completes the handover; the transfer closes; cost is recorded.
6. Every party received the expected notifications; one escalation fired when a response was delayed.
7. The audit trail is complete and the metrics report shows the transfer's timings.

---

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Privacy & compliance | Kenya Data Protection Act 2019 and Digital Health Act 2023 assessed before pilot; data protection impact assessment; data-sharing agreements between institutions; retention and deletion policy |
| Data residency | Confirm whether health data must be hosted in Kenya. The containerised build supports a Kenyan provider or a cloud region; decision needed before Phase 9 |
| Security | TLS everywhere, encryption at rest, MFA for privileged roles, least-privilege access, rate limiting, dependency scanning, external penetration test before pilot |
| Availability | Health checks, automated backups with tested restore, documented downtime procedure (phone fallback, retrospective entry of referrals) |
| Performance | Status changes reach other parties within a few seconds on normal connections; target to be agreed |
| Connectivity | Usable on 3G; offline crew app; SMS fallback for critical alerts |
| Accessibility | WCAG 2.2 AA; keyboard navigation; visible focus; status not conveyed by colour alone |
| Language | English first; text externalised so Kiswahili can be added |

---

## 9. Success metrics captured by the platform

Timings use persisted referral and transfer timestamps; vehicle utilisation uses the append-only
vehicle availability timeline. Older vehicle availability changes cannot be reconstructed before
that timeline was introduced.

| Metric | Calculation |
|---|---|
| Referral initiation time | Draft created → Submitted |
| Facility acceptance time | Submitted → first Accepted |
| Referral rejection rate | Declined requests ÷ all requests |
| Ambulance assignment time | Transport requested → Ambulance assigned |
| Ambulance response time | Dispatched → At pickup |
| Patient collection time | At pickup → Patient collected |
| Transfer duration | Patient collected → Arrived |
| Handover completion rate | Transfers with signed handover ÷ arrived transfers |
| Referral completion rate | Completed ÷ submitted |
| Ambulance utilisation | Time on assignment overlapping recorded available-fleet time ÷ recorded available-fleet time |
| Transfer cost | Sum and average of recorded costs |
| Platform adoption | Currently active institutions with referral or transfer activity, and currently active users who signed in during the period |

Targets such as "average response under 15 minutes" remain hypotheses until compared with the Phase 1 baseline.

---

## 10. Risks and mitigations

| Risk | Mitigation in the product |
|---|---|
| Outdated capacity data leads to a bad referral | Timestamps and staleness labels; acceptance is always confirmed by the receiving facility, never inferred from capacity |
| Ambulance shown as available but is not | Provider confirmation required; stale-status exclusion from suggestions; reassignment flow |
| Clinical score misused as a decision | Separate clinician urgency; governance-approved, versioned thresholds; clear labelling |
| Poor connectivity | PWA, offline crew app, SMS fallback, downtime procedure |
| Low adoption due to extra work | Short referral form with progressive detail; one-tap status updates; pilot feedback loop |
| Privacy breach | Role/institution scoping, minimum-necessary notifications, audit logging of record access, penetration testing |
| Integration expectations | Integration interfaces defined from Phase 0; adapters built once pilot sites' systems are known |

---

## 11. Open questions affecting the build

To be discussed at next week's meeting. Defaults used until answered are in the right column.

| Question | Default in MVP |
|---|---|
| Who may accept or decline a referral? | Configurable role "Receiving decision-maker" |
| Independent providers, hospital-owned ambulances, or both? | Both, modelled as ambulance-provider institutions |
| Do providers already have fleet tracking? | Crew-app GPS; telematics integration later |
| Who pays for transport; does Lifeline handle payment? | Record cost and payer only |
| Is HIS integration required for the first pilot? | No; manual entry, integration interfaces stubbed |
| How will capacity be updated? | Manual capacity board by authorised facility staff |
| Is real-time GPS needed in the first release? | Yes, via crew app, with honest staleness handling |
| Which early-warning scores are clinically approved? | Adult score scaffolded and disabled until governance sign-off |
| Hosting location | Containerised; provider decided before Phase 9 |
| Does an existing prototype have reusable code? | Review before Phase 0 starts |

---

## 12. Suggested additions to the problem statement

1. **Early-warning scores by population.** Adult MEWS is not designed for pregnant or postpartum women or children. Obstetric (e.g. MEOWS) and paediatric (e.g. PEWS) scores need clinical governance decisions, especially given the maternal-health evidence cited.
2. **Back-referral.** Returning the patient and discharge information to the originating facility is part of the referral cycle; name it as a later phase.
3. **Patient identification.** Which identifiers are used (national ID, SHA number, hospital number), and how unidentified or emergency patients are handled.
4. **Downtime and retrospective entry.** How phone-based referrals made during outages are recorded so metrics and audit remain complete.
5. **Next-of-kin and lawful basis.** Whether families are notified and on what lawful basis patient data is processed and shared.
6. **Sources for statistics.** The KMA, ICU, ambulance response, non-functional ambulance and KNH call-ahead figures should carry citations before external use.
