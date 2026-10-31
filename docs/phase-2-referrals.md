# Phase 2 — Referrals and clinical assessment

**Status:** Complete, pending review\
**Date:** 1 November 2026\
**Plan reference:** [implementation-plan.md](implementation-plan.md), section 7, Phase 2

## Done-when criterion

| Criterion from the plan | Result |
|---|---|
| A referral reaches Accepted with full history | Met. An end-to-end test drafts a referral, records observations (NEWS2 14, high), sends it to three facilities, answers one facility's information request, takes a decline from another and an acceptance from the third. The remaining request is withdrawn automatically, a second acceptance is refused, and the history shows all 11 steps in order with who and when. The same flow was repeated on the running app through the web proxy, including a document upload and download |

## What was built

### Referral record
- **Patient:** name (optional, for unidentified patients), sex, date of birth or estimated age (years, months or days, for newborns), national ID, SHA number, hospital number, next of kin. Only what coordination needs; full records stay in hospital systems.
- **Clinical details:** reason, summary, provisional diagnosis, treatment given, allergies, pregnancy status and gestation, and the services the patient needs.
- **Urgency** (emergency, urgent, routine) is the clinician's judgement, required before sending, and always shown separately from any score.
- Human-readable reference per network, e.g. `DEMO-26-00042`.
- Saved as a draft first; only the referring facility sees drafts.

### Observations and early-warning score
- Respiratory rate, oxygen saturation, supplemental oxygen, blood pressure, heart rate, temperature, level of consciousness (ACVPU), notes. Implausible values (e.g. SpO₂ 980) are rejected as probable typing errors.
- Each network chooses **no score (default), MEWS or NEWS2**. The score is calculated when observations are saved, stored with them, and previewed live while typing.
- No partial totals: if an observation is missing the screen says which one.
- Not calculated in pregnancy, the postpartum period, under-16s or when age is unknown; the screen explains why and points to the appropriate chart.
- Abnormal values are highlighted on the referral.

### Sending and responding
- The referrer chooses up to 5 facilities from suggestions that offer the needed services, nearest first, with current bed reports and how fresh they are.
- Each facility gets its own **request** and sees only its own: other facilities' names, answers and conversations are hidden.
- Receiving decision-makers can **accept** (with department, ready-from time and conditions), **decline** (with a reason category) or **ask for more information**.
- **First acceptance wins.** It claims the referral in a single database operation and withdraws all other open requests with "Accepted by another facility", so the same patient can never be accepted twice.
- When every facility has declined, the referrer is prompted to choose others. Referrers can also withdraw a request or cancel the referral.

### Conversations, documents and history
- A message thread per receiving facility. Answering an information request puts the request back in the facility's queue automatically.
- Documents (PDF, JPEG, PNG, up to 10 MB, 10 per referral), checked by their actual content rather than their name. Downloads are never cached.
- History of every step with who and when. History, messages and observations are append-only, enforced by database triggers.

### Inboxes
- **Sent by my facility**, **Received**, and (for network operations) **Whole network**, with an "open only" filter.
- Each item states the viewer's next action, e.g. "Respond to request" or "Answer information request". Lists refresh every 30 seconds until live updates arrive in Phase 5.

### Privacy and audit
- A referral is visible only to the referring facility, the facilities it was sent to, and network operations. Anyone else gets "not found", so they can't learn that it exists.
- Opening a referral is recorded in the audit log (at most once per person per referral every 15 minutes), as are every response, message, document upload and download. Audit entries never contain patient names.

## Decisions taken during Phase 2

| Decision | Reason |
|---|---|
| Early-warning score is off by default; MEWS (Subbe 2001) and NEWS2 (RCP 2017, SpO₂ scale 1) are available per network | Clinical governance must approve the score and its use. Neither is validated in pregnancy or children, so they're not calculated there. MEWS scores "new confusion" like "responds to voice"; governance should confirm |
| Thresholds are the published ones, not configurable yet | Changing thresholds is a clinical decision; it can be added once a governance process exists |
| First acceptance wins, rather than the referrer choosing among several acceptances | Simpler and safer: a facility that accepted has reserved a bed, so the patient should go there. The referrer can still cancel and re-refer |
| Attachments stored in the database | Keeps the pilot to one data store with one backup. Move to object storage if volume grows |
| No offline service worker yet | A cached referral form would leave patient data on shared clinic computers. Drafts are saved on the server instead; offline support is planned for the crew app (Phase 4), where it matters most |
| The web proxy accepts bodies up to 25 MB | Next.js cuts proxied bodies at 10 MB by default, which turned oversized uploads into server errors instead of a clear "too large" message |

## Follow-ups

1. **Notifications** (SMS and push) for new requests, information requests and acceptances, Phase 7. Until then, receiving facilities rely on the inbox and the 30-second refresh.
2. **Escalation** when nobody responds within a set time, Phase 7.
3. **Obstetric (MEOWS) and paediatric (PEWS) charts**, once clinical governance chooses which versions to use.
4. **Patient matching** across referrals (the same patient referred twice) is not attempted; each referral creates its own patient record.
5. **Back-referral** to the original facility after treatment, as noted in the plan.
6. Transport arrangements: done in Phase 3 (see [phase-3-ambulances-dispatch.md](phase-3-ambulances-dispatch.md)).
