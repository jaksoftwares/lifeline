# Afyaline: Product Flow and Implementation Plan

Afyaline connects hospitals and ambulance providers so a patient can move from one facility to another quickly, safely and at a known cost. It replaces the round of phone calls a transfer depends on today.

> Formerly "Lifeline". The previous over-engineered version is preserved on the `archive/lifeline-v1` branch (tag `lifeline-v1-final`).

---

## 1. The problem

When a hospital needs to transfer a patient today:

1. Staff **phone around** to find a hospital that has a bed and the right service.
2. They explain the patient's condition again on every call.
3. Once a hospital agrees, they **phone again for an ambulance** (Red Cross, the county government, the hospital's own fleet, private providers).
4. The ambulance crew **doesn't know the best route**. Nobody can see where the patient is.
5. On arrival, the **handover is informal**. Nothing is recorded about the time taken, distance, fuel, consumables or the patient's condition.

Lives are lost to delay, and money, fuel and ambulance time are wasted. Nobody can measure any of it.

## 2. What Afyaline does

One shared, real-time workflow for three kinds of participant:

| Participant                             | What they do on Afyaline                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Hospital** (sending and/or receiving) | Sends transfer requests, accepts or declines incoming ones, keeps bed availability up to date, confirms handover |
| **Ambulance provider**                  | Registers its ambulances (type, equipment, fuel use), drivers and fuel price; assigns ambulances to transfers    |
| **Driver**                              | Gets the trip on their phone, follows the route, updates status with one tap, shares live location               |

A platform admin (the Afyaline team) sees the whole network and its statistics.

## 3. The end-to-end flow

```
SENDING HOSPITAL          RECEIVING HOSPITAL           AMBULANCE PROVIDER / DRIVER
1. New transfer      ──►  2. Accept / Decline
   (patient, brief,          (sees patient brief,
    urgency, need)           urgency, distance)
        │  accepted ◄────────┘
        ▼
3. Request ambulance ──────────────────────────────►  4. Provider assigns ambulance + driver
                                                      5. Driver: route → pickup →
                                                         patient onboard → live location
                          6. Watches ambulance arrive ◄──
                          7. Confirms handover
                             (received by, condition)
        ▼
8. Transfer report: timeline, durations, distance, costs → dashboards & stats
```

### Step by step

1. **Create the transfer (sending hospital).** One screen:
   - Patient: **full name**, age, sex
   - Condition summary, brief history, key vitals
   - Urgency: _critical / urgent / stable_
   - Service needed (ICU, HDU, maternity, NICU, theatre, general…)

   Afyaline lists hospitals that offer that service and have beds available, nearest first, each with a call button. The sender chooses one.

2. **Accept or decline (receiving hospital).** The request appears instantly on their _Incoming_ screen with a sound alert. Accepting confirms a bed. Declining requires a reason, and the sender can resend to another hospital from the same screen.
3. **Request an ambulance (sending hospital).** Afyaline lists available ambulances with the equipment the urgency requires (for example a ventilator or oxygen), nearest first, and the request goes to that provider.
4. **Assign (ambulance provider).** The provider confirms the ambulance and assigns a driver in one action.
5. **Trip (driver, on a phone).** The driver sees the pickup and destination and the suggested route with distance and ETA. They tap _Start → Arrived at pickup → Patient onboard → Arrived at hospital_. The phone shares its location while the trip is active.
6. **Track (both hospitals).** Both hospitals see the ambulance moving on a map with a live status timeline.
7. **Handover (receiving hospital).** They confirm _received by_, the patient's condition on arrival and any notes. The driver records consumables used.
8. **Report.** The transfer closes. A printable report shows the full timeline, every duration, distance and costs. All the numbers feed the dashboards.

A hospital can be both **sending** and **receiving**. It has _Outgoing_ and _Incoming_ tabs under one account.

### Transfer statuses

```
requested → accepted → ambulance_assigned → en_route_to_pickup → patient_onboard → arrived → handed_over
     └→ declined (sender picks another hospital → requested)
any active status → cancelled
```

Each status change records **who** made it and **when**. Every duration in the reports comes from these records.

## 4. Costs

Each ambulance has a fuel use (litres/100 km). Each provider sets a fuel price (KES/litre).

- **Fuel cost** = distance (km) × fuel use ÷ 100 × fuel price
- **Consumables** (oxygen, drugs, supplies) are entered at handover
- **Other costs** (tolls, crew allowances) are optional
- **Total cost per transfer** is shown on the report and rolled up per provider, per hospital and per county.

## 5. Dashboards and reports

- **Hospital:** transfers out and in, acceptance rate, average time to acceptance, decline reasons, active transfers.
- **Provider:** trips, km driven, fuel cost, total cost, cost per trip, ambulance use.
- **Platform overview:**
  - total transfers
  - average time from request to acceptance, request to pickup, and request to handover
  - transfers by urgency and county
  - total and average cost
- **Impact:** measured times against a phone-based baseline supplied by the team or from pilot data (never invented).

---

## 6. Technology stack

| Concern            | Choice                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| App (UI + backend) | **Next.js** (App Router, TypeScript, Server Actions)                                                                                        |
| Database           | **Supabase Postgres**                                                                                                                       |
| Auth               | **Supabase Auth** (email + password)                                                                                                        |
| Live updates       | **Supabase Realtime**                                                                                                                       |
| Access control     | **Row Level Security** in Postgres                                                                                                          |
| Maps               | **OpenStreetMap** tiles via Leaflet                                                                                                         |
| Routing            | **OSRM** (OpenStreetMap routing): distance, ETA and alternative routes. _No live traffic. Google Routes with traffic is planned for later._ |
| Driver navigation  | "Navigate" button that opens the phone's maps app with the destination                                                                      |
| Styling            | Tailwind CSS with a small set of in-project components                                                                                      |
| Validation         | Zod                                                                                                                                         |
| Driver app         | The same web app with a mobile layout, installable as a PWA (no app store)                                                                  |
| Hosting            | Vercel (or any Node host)                                                                                                                   |

Removed from the old stack: NestJS, Prisma, Turborepo, the Expo mobile app, Docker, Redis, PostGIS, the shared internal packages, custom auth.

## 7. Data model (6 tables)

| Table               | Purpose                                  | Key fields                                                                                                                                                                                                                                       |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `organizations`     | Hospitals and ambulance providers        | type (`hospital` / `ambulance_provider`), name, county, phone, address, lat/lng, level (hospitals), fuel price (providers), verified                                                                                                             |
| `profiles`          | A person, linked to a Supabase Auth user | organization, full name, phone, role (`admin` / `staff` / `driver`), licence no. (drivers), platform admin flag                                                                                                                                  |
| `hospital_capacity` | What a hospital can take right now       | hospital, service, beds available, updated at                                                                                                                                                                                                    |
| `ambulances`        | A provider's fleet                       | provider, plate, type (`basic` / `advanced` / `critical_care`), equipment list, fuel use (L/100 km), status (`available` / `on_trip` / `offline`), current lat/lng, last seen                                                                    |
| `transfers`         | One row per patient move                 | code (`AFY-00123`), sending and receiving hospital, patient full name, age, sex, condition, history, vitals, urgency, service needed, status, provider, ambulance, driver, route distance and ETA, costs, handover details, a timestamp per step |
| `transfer_events`   | Timeline and audit trail                 | transfer, status, actor, time, note                                                                                                                                                                                                              |

**Access rules (RLS), in plain terms:**

- Every signed-in user can see the directory of organizations, hospital capacity and ambulance availability. This is needed to choose a hospital or ambulance.
- An organization edits only its own details, capacity, ambulances and staff.
- A transfer is visible only to the sending hospital, the receiving hospital and the assigned provider (including its driver).

## 8. Registration (demo mode)

For the demo, registration is **open and frictionless**:

1. Choose **Hospital** or **Ambulance provider**.
2. Enter organization details (name, county, phone, location on the map) and the admin account (name, email, password).
3. The account is ready immediately. Organizations are verified automatically.

The `verified` column is kept, so manual approval can be switched on before a real pilot.

Inside an organization:

- The admin adds staff and drivers (name, email, temporary password).
- Hospitals set their services and beds.
- Providers add ambulances and set the fuel price.

## 9. Project structure

```
/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # landing page
│   │   ├── login/  register/        # auth
│   │   └── (app)/
│   │       ├── dashboard/           # role-aware overview & stats
│   │       ├── transfers/           # list, new, [id] (timeline, map, handover, report)
│   │       ├── incoming/            # receiving hospital queue
│   │       ├── capacity/            # hospital beds & services
│   │       ├── fleet/               # ambulances & drivers (providers)
│   │       ├── trip/                # driver's phone view
│   │       ├── reports/             # reports & exports
│   │       └── settings/            # organization & staff
│   ├── components/
│   └── lib/
│       ├── supabase/                # browser, server, middleware clients
│       ├── routing.ts               # OSRM routing
│       └── costs.ts                 # cost calculation
├── supabase/
│   ├── migrations/                  # SQL migrations
│   └── seed.sql                     # demo data
└── docs/afyaline-plan.md            # this file
```

## 10. Database scripts

```bash
pnpm db:push       # apply supabase/migrations/*.sql to the Supabase database
pnpm db:seed       # replace the demo data (hospitals, providers, ambulances, people, transfers)
pnpm db:new <name> # create a new migration file
```

Environment (`.env.local`, never committed):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only
SUPABASE_DB_URL=                  # Supabase → Connect → Session pooler (used by db:push)
```

---

## 11. Implementation phases

| #   | Phase                         | Delivers                                                                                                | Done when                                                            |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 0   | **Archive & reset**           | Old code archived on `archive/lifeline-v1`; one clean Next.js app named Afyaline                        | `pnpm dev` runs an empty Afyaline app                                |
| 1   | **Database & auth**           | Migrations (6 tables, RLS), demo seed, Supabase auth, protected routes                                  | Migrations apply to Supabase; sign-in works                          |
| 2   | **Registration & onboarding** | Open registration for hospitals and providers; capacity, ambulances, drivers, staff                     | Both sides register and fully set up without help                    |
| 3   | **Transfer flow**             | New transfer, hospital matching, accept/decline, ambulance request and assignment, live shared timeline | A transfer goes from request to assigned across three sessions, live |
| 4   | **Driver trip & routing**     | Driver phone view, OSRM route + ETA, live location on an OpenStreetMap map                              | A driver completes a trip on a phone while the hospitals watch       |
| 5   | **Handover & costs**          | Handover confirmation, consumables, automatic fuel cost, printable transfer report                      | Every completed transfer has a clean report                          |
| 6   | **Dashboards & reports**      | Hospital, provider and platform dashboards; impact metrics                                              | The investor demo shows real numbers from seeded and live transfers  |
| 7   | **Polish & launch**           | Landing page, mobile polish, empty and error states, demo accounts, deployment                          | A shareable URL ready for investors                                  |

## 12. Deliberately later

- Google Maps routing with **live traffic**
- SMS/WhatsApp alerts (e.g. Africa's Talking). Until then, every screen has click-to-call.
- 922 / county dispatch integration
- Hospital system (EMR) integration, attachments
- Manual organization verification (switch on before a real pilot)
- Billing and payments

## 13. Principles

- **Fewer clicks than a phone call.** If a step is slower than calling, it is wrong.
- **One record per transfer**, visible to everyone involved, and only to them.
- **Big, clear, mobile-first** screens for people working under pressure.
- **Measure everything automatically.** Timestamps and distances come from the workflow, not from forms.
- **Patient data stays minimal and protected** (Kenya Data Protection Act 2019).
