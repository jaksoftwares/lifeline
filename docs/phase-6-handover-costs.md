# Phase 6 — Handover and costs

**Status:** Implemented; automated acceptance flow verified\
**Date:** 1 November 2026\
**Plan reference:** [implementation-plan.md](implementation-plan.md), section 7, Phase 6

## Done-when criterion

| Criterion from the plan | Result |
|---|---|
| Transfer completes with a full audit trail and cost recorded | Met in the API E2E flow: the crew reports arrival, the receiving decision-maker signs the checklist, an authorised participant records the cost and payer, and the receiving decision-maker completes the transfer. The status events and audit records are checked, and completion releases the confirmed assignment. |

## What was built

- **Receiving handover:** After arrival, a receiving decision-maker at the destination signs a required checklist covering patient identity, clinical summary, latest observations, treatment and allergies, and documents/results (or confirms they do not apply). The signed record captures the user and server time; optional notes are supported.
- **Trip cost:** An authorised arranger or assigned provider dispatcher records one cost per transfer, in KES, with up to two decimal places, a payer and optional notes. “Other” payers require a name. Recording is operational only; Lifeline does not collect or process payment.
- **Completion:** The receiving decision-maker can complete only after handover is signed and a cost is recorded. Completion records its timestamp, closes the confirmed assignment and makes the vehicle available for another trip.
- **History and audit:** Handover, cost and completion each create an append-only transfer event and an audit record. Handover and cost records are immutable in the database as well as through the API.
- **Web:** The transfer page shows the checklist, signatory, cost, payer and timestamps. It offers the actions permitted to the current user and extends the journey timeline through completion.

## Access and workflow

1. The crew app continues to stop at **Arrived**; receiving staff perform handover in the web app.
2. Only a user with `handover:sign` at the receiving institution can sign or complete the transfer. In the current role catalogue this is the receiving decision-maker.
3. Cost recording is available to the transport arranger or a dispatcher assigned to the transfer. A zero cost is valid when no charge applies.
4. Handover and cost are write-once records. Corrections require a separately designed audited adjustment workflow; payment processing and invoicing are out of scope.

## Verification

- Shared-schema tests cover checklist completeness, amount precision and payer-name validation.
- The Phase 6 API E2E test covers arrival gating, role scoping, duplicate prevention, handover/cost persistence, audit events, append-only enforcement, completion and assignment release.
- Workspace typecheck, lint, unit tests and the full API E2E suite are run for this phase.
