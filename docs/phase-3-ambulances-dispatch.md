# Phase 3 — Ambulances and dispatch

**Status:** Complete, pending review\
**Date:** 1 November 2026\
**Plan reference:** [implementation-plan.md](implementation-plan.md), section 7, Phase 3

## Done-when criterion

| Criterion from the plan | Result |
|---|---|
| A dispatcher assigns and the provider confirms a suitable vehicle | Met. An end-to-end test requests transport for an accepted emergency referral (advanced life support, oxygen and cardiac monitor). Lifeline suggests two suitable vehicles, quickest first, and explains why five others are excluded. An unsuitable vehicle is refused. The transfer is offered to the nearest vehicle; the provider's dispatcher sees it without the patient's name, confirms it with a vehicle and two crew, then marks it dispatched. Other providers and unrelated facilities can't see it. The history shows Requested → Offered → Confirmed → Dispatched with who and when. The same flow was repeated on the running app through the web proxy |

## How it works

1. **Request.** Once a receiving facility has accepted, the referring facility says what care the patient needs on the way: level of care, equipment, when the patient is ready, and notes for the crew. The level is pre-selected from the urgency as a starting point only.
2. **Suggestions.** Lifeline lists suitable vehicles from every provider in the network, quickest to reach the patient first. Each suggestion says why (level, equipment, estimated time, when availability was confirmed) and warns about anything to watch (higher level than needed, already offered elsewhere, declined earlier). Vehicles left out are listed with the reason.
3. **Offer.** The arranger offers the transfer to one vehicle. Nothing is assigned yet.
4. **Confirmation.** The provider's dispatcher confirms with the vehicle and named crew (and may send a different suitable vehicle of theirs), or declines with a reason. Confirming also confirms the vehicle is available now.
5. **Dispatch.** The dispatcher marks the ambulance as dispatched. The crew app (Phase 4) takes the trip further.

If no suitable vehicle is available, the arranger records transport arranged another way: 922, a county ambulance not on Lifeline, or other transport.

### Changes along the way
- **Decline**: the transfer goes back to the arranger, who sees "Declined by … : reason" and offers another vehicle.
- **Withdraw**: the arranger takes the trip back, e.g. no answer in time.
- **Reassign**: the dispatcher swaps vehicle or crew. A dispatched trip that changes vehicle returns to "Ambulance assigned".
- **Release**: the provider can no longer do the trip; it goes back to awaiting transport.
- **Cancel**: the arranger cancels transport, or cancelling the referral cancels it too. Both stand down any ambulance on its way. Neither is allowed once the patient has been collected.

### Fleet
- Provider administrators register vehicles (registration, call sign, level of care, equipment, base) and crew (qualification, phone, link to a crew-app account), and can retire either.
- Dispatchers set each vehicle's availability: available, out of service or off duty. A vehicle on a confirmed trip shows as "On a transfer" whatever its setting.
- Availability not confirmed for 12 hours (one shift) is out of date: the vehicle isn't suggested until a dispatcher confirms it. The limit is a network setting.
- Network operations see every provider's fleet; each provider sees only its own.

### Who sees what
- **Referring facility:** everything about its transfers, and arranges them.
- **Receiving facility:** follows the transfer (status, ambulance, crew, estimated times) but doesn't arrange it.
- **Network operations:** every transfer, and can arrange transport for any referral.
- **Provider:** only transfers offered to it, and only its own offers. It sees the patient's name only after confirming; before that it sees the route, the care needed and the crew notes. It can't open the referral.
- Opening a transfer that shows the patient's name is audited (at most once per person every 15 minutes), as is every offer, answer and fleet change.

### Integrity
- One open transfer per referral, one open offer per transfer, and one confirmed trip per vehicle are enforced by partial unique indexes, so racing requests can't double-book an ambulance. A crew member can't be on two confirmed trips at once.
- Transfer history is append-only, enforced by a database trigger.

## Decisions taken during Phase 3

| Decision | Reason |
|---|---|
| Hospital-owned and independent ambulances are both modelled as ambulance-provider institutions | As the plan proposed. A hospital's ambulance unit is its own provider with its own dispatchers |
| The referring facility (or network operations) chooses the vehicle; the provider's dispatcher confirms | The facility knows the patient's needs and Lifeline shows it every provider's fleet; the provider knows whether the vehicle and crew are really free. Nothing is assigned on suggestion alone |
| Offers go to one provider at a time | Offering several at once risks two ambulances driving to the same patient. Withdrawing and re-offering takes seconds |
| Network operations can arrange transport (`transport:request` added to the role) | Operations teams step in when a facility can't find transport |
| Four levels of care: patient transport, basic life support, advanced life support, critical care. Equipment is a fixed list | Covers the transport types in the problem statement. Neonatal transport is expressed as the incubator. Levels and equipment can become a per-network catalogue if counties need different ones |
| Crews are put together per trip; there is no fixed team record | Shifts change; dispatchers choose who is on each trip |
| Vehicle availability is set by the provider; "on a transfer" is derived from confirmed trips | One source of truth for whether a vehicle is busy |
| Patient's name withheld from providers until they confirm | Minimum necessary data. The crew notes are shared before, because they are needed to decide |
| Time to pickup is an estimate from straight-line distance (× 1.4 at 40 km/h), from the vehicle's last reported position if under 30 minutes old, otherwise its base | The plan calls for routing-engine times. They need a routing service (e.g. OSRM with Kenyan map data); positions arrive in Phase 5. The screen labels every time as an estimate |

## Demo

Run `pnpm db:migrate`, then `pnpm db:seed`. The seed adds a county ambulance service, seven vehicles in different states (available, out of service, off duty, availability out of date), crew, a county dispatcher, and an urgent obstetric referral already accepted by the East hospital.

1. Sign in as `clinician.north@demo.lifeline.test`, open the accepted referral for Wanjiku Njoki Kamau and arrange transport.
2. Offer the transfer to a suggested vehicle.
3. Sign in as `dispatcher@demo.lifeline.test` (Demo Ambulance Services) or `dispatcher.county@demo.lifeline.test` (Demo County Ambulance Service), open Transfers → Dispatch, and confirm with crew.

Vehicle availability in the seed is relative to when it was run, so after 12 hours the demo vehicles show as out of date. Confirm them on the Fleet page as a dispatcher.

## Follow-ups

1. **Alerts** for new offers, declines, releases and transfers waiting too long (Phase 7). Until then, lists refresh every 30 seconds and network operations see "No vehicle offered yet" or "Awaiting confirmation from …".
2. **Per-network levels of care and equipment**, if counties use different classifications.

Live positions and optional OSRM road-routing estimates are implemented in [Phase 5](phase-5-live-tracking.md). The crew app is documented in [Phase 4](phase-4-crew-app.md), and trip cost recording in [Phase 6](phase-6-handover-costs.md).
