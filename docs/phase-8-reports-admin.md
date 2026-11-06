# Phase 8 — Reports and administration

Phase 8 adds an authorised success-metrics report with CSV and PDF downloads, and a network
configuration page. Existing institution, user/role, and audit pages remain the administration
surfaces; this phase links them from the report and application navigation instead of duplicating
them.

## Reports

The report uses a date range in East Africa Time, inclusive of both selected dates, and accepts a
maximum of 367 calendar days. Network-wide reporting is limited to network-wide `reports:view`
grants. Institution-scoped grants see only activity involving their allowed institutions, and an
explicit institution filter outside that scope is forbidden. Reports contain aggregate measures
only; no patient-identifying fields are exported.

| Measure | Calculation |
|---|---|
| Referral initiation | Average `submittedAt - createdAt` for referrals created during the period and subsequently submitted |
| Facility acceptance | Average `acceptedAt - submittedAt` for referrals accepted during the period |
| Referral rejection rate | Requests declined during the period ÷ requests sent during the period |
| Ambulance assignment | Average `assignedAt - requestedAt` for transport requests made during the period |
| Ambulance response | Average `atPickupAt - dispatchedAt` for transfers with a relevant event in the period |
| Patient collection | Average `collectedAt - atPickupAt` for transfers with a relevant event in the period |
| Transfer duration | Average `arrivedAt - collectedAt` for transfers with a relevant event in the period |
| Handover completion | Arrived transfers with a signed handover ÷ transfers arriving during the period |
| Referral completion | Submitted referrals with a completed transfer ÷ referrals submitted during the period |
| Ambulance utilisation | Assigned minutes overlapping recorded available-fleet time ÷ recorded available-fleet minutes |
| Transfer costs | Total and average recorded KES costs for the period |
| Active institutions | Currently active institutions with referral or transfer events recorded during the period |
| Active users | Currently active accounts with a sign-in during the period |

An average is `No data` when it has no completed observations; it is not shown as zero. Each rate
reports its numerator and denominator. Vehicle availability history starts at migration time for
existing vehicles, using their latest persisted status and timestamp as a baseline; earlier status
changes cannot be reconstructed. An `AVAILABLE` status contributes only until its configured
freshness threshold expires, unless the status is reconfirmed. Utilisation therefore does not invent
pre-migration history or assume stale vehicles remained available.

The CSV is UTF-8 with a byte-order mark and escaped cells. The PDF is a generated, paginated A4
report with the network, period, metric values, observation counts, and calculation notes.

## Network configuration and administration

Network administrators can configure capacity freshness, vehicle availability freshness, and the
network's early-warning score. Changes are audited with the prior and new settings. Referral
escalation timing remains on the Notifications page. Existing institution profile/catalogue
management, scoped user and role management, and the paginated audit viewer continue to enforce
their existing permissions.

## Verification

API end-to-end tests cover report calculations and date boundaries, network/institution scope,
CSV and PDF downloads, and audited network settings. The existing user, institution, and audit
tests remain the acceptance coverage for those administration surfaces.
