# Phase 1 — Facility network and capacity

**Status:** Complete, pending review\
**Date:** 1 November 2026\
**Plan reference:** [implementation-plan.md](implementation-plan.md), section 7, Phase 1

## Done-when criterion

| Criterion from the plan | Result |
|---|---|
| A clinician finds suitable facilities by service and travel time | Met. Covered by end-to-end tests and checked on the running app: a clinician at Demo Sub-County Hospital North searching for intensive care sees three facilities, nearest first, each with an estimated drive time and timestamped ICU bed figures; the one with a 9-hour-old report is marked out of date |

## What was built

### Catalogue
- Each network has a catalogue of **services** (17 to start, e.g. intensive care, comprehensive emergency obstetric care, neurosurgery, CT imaging) and **capacity items** (16 to start: 8 bed types, 4 equipment items, 4 on-call specialists). The defaults live in `@lifeline/domain` so new networks start from the same list.
- Networks set how old a capacity report can be before it is shown as out of date (default 4 hours).

### Facility profiles
- Location (latitude/longitude, checked to be within Kenya to catch swapped values), address, main phone, ownership, county (from the list of 47 counties).
- Departments with direct phone lines.
- Services offered and the capacity items each facility reports on.
- Network administrators can add institutions, rename them, change level and deactivate them (inactive institutions drop out of searches). Facility administrators edit their own facility's contact, location, services, items and departments.

### Capacity reporting
- Referral coordinators, receiving decision-makers and facility administrators report capacity for their own facility from the new **Capacity** page.
- Beds are reported as free/total counts with a status; equipment and specialists by status (Available, Limited, Unavailable). The same consistency rules run in the browser and the API (e.g. "no free beds" must be "unavailable").
- Saving records every item, so unchanged figures are confirmed as current. The page shows which items are out of date.
- Every report is kept in an append-only history (enforced by a database trigger) and shown on the facility page with the reporter's name. Each save is also written to the audit log.

### Finding a facility
- Filter by services needed (all must be offered) and by what the facility must currently have.
- A facility is hidden only when its *current, fresh* report says the item is unavailable. Missing or out-of-date reports stay in the list with a clear "call to check" warning, so a facility isn't excluded just because nobody updated it.
- Results are ordered by estimated drive time from the patient's facility, with straight-line distance, current capacity, when and by whom it was reported, and a tap-to-call phone number.
- List view by default, with a map view (loaded only when opened). Results refresh every minute while the page is open.

## Decisions taken during Phase 1

| Decision | Reason |
|---|---|
| Drive times are estimated as straight-line distance × 1.4 at 40 km/h, and always labelled as estimates | No routing service is configured yet. The formula is deliberately cautious. Replace with a routing provider (Mapbox or self-hosted OSRM) when a key and budget are agreed |
| Coordinates stored as latitude/longitude numbers, not PostGIS geometry | Twenty facilities don't need spatial indexes. PostGIS remains available for ambulance proximity in Phase 3 |
| "Unavailable" capacity is shown in neutral grey, not red | Brand guidelines reserve red for genuinely critical states. A full ICU is normal operational information |
| Map tiles default to OpenStreetMap's public servers | Fine for development and a small pilot. Set `NEXT_PUBLIC_MAP_TILE_URL` to a commercial tile provider before wider rollout, as the OpenStreetMap usage policy requires |
| Current capacity is kept on `FacilityResource`, history in `CapacityUpdate` | Searches read one row per item instead of scanning the history |

## Follow-ups

1. **Routing provider** for real drive times (see above).
2. **Catalogue management screen** for network administrators. The catalogue is seeded for now; changes need a developer.
3. **Capacity reminders**: nudge facilities by SMS or push when their figures go out of date (Phase 7, notifications).
4. **Integration feed**: the data model already distinguishes manual from system-reported capacity (`CapacitySource`) for when hospital systems can send figures automatically.
5. Demo capacity for facilities without a demo administrator shows no reporter name; this is seed data only.
