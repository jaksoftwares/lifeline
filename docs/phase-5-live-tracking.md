# Phase 5 — Live tracking

**Status:** Implemented; deployment and device review remain\
**Date:** 1 November 2026\
**Plan reference:** [implementation-plan.md](implementation-plan.md), section 7, Phase 5

## Done-when criterion

| Criterion from the plan | Result |
|---|---|
| All parties see the same live transfer state | Met in the API end-to-end test. The referring facility, receiving facility, assigned provider and network operations receive scoped live events and reload the same status, latest position and ETA. An unrelated facility receives no event and cannot read the transfer. |

## What was built

- **Tracking data:** The crew app's Phase 4 location pings feed the transfer detail and summary APIs. Transfer detail includes a recent route, thinned to at most 200 points from the most recent 3,000 fixes.
- **Honest freshness:** Positions are live through 3 minutes, delayed through 15 minutes, and then marked lost. ETA is withheld for a lost position or while the ambulance is stopped. The UI shows the position age and does not present a stale location as current.
- **ETA:** `OSRM_URL` enables road routing. When it is absent or unavailable, Lifeline falls back to the existing straight-line estimate and labels it accordingly. Estimates account for time elapsed since the last fix.
- **Live changes:** Authenticated browsers receive Server-Sent Events for transfer and position changes. Events are scoped with the existing transfer access rules; clients invalidate and reload the relevant queries through the authorised API. Existing periodic refresh continues as a fallback.
- **Operations overview:** Network operations can see open transfers, status counts, items needing attention, position ages, ETAs and an ambulance map. Transfer details show the map and a text-based journey timeline.

## Decisions and limits

| Decision | Reason |
|---|---|
| Push only a transfer id and change kind; reload detail through the API | The API remains the source of truth and applies permissions to every read |
| Keep the event bus in process for the pilot | One API instance is simpler at the current scale; multi-instance deployments need Redis pub/sub |
| Fall back to an explicitly labelled estimate if OSRM is unavailable | Routing failures must not stop transfer tracking |
| Keep the timeline alongside the map | Tracking remains useful when map tiles cannot load or a user cannot interpret the map |

Map tiles default to OpenStreetMap. Before deployment, configure an appropriate tile service and attribution for the expected usage. Configure `OSRM_URL` when road-routing estimates are required.

## Verification and follow-ups

- Verified: tracking domain tests, API routing-service tests, the Phase 5 live API E2E scenario, workspace typecheck/lint/unit tests and API E2E suite.
- Still review the maps and reconnection behavior in a real browser and review Phase 4 location permissions/background reporting on supported phones.
- The live event bus is single-instance. Add a shared event transport before scaling the API horizontally.
