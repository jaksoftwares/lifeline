# Phase 7 — Notifications and escalations

**Status:** In-app and Postmark email implemented; SMS and push remain unconfigured\
**Plan reference:** [implementation-plan.md](implementation-plan.md), section 7, Phase 7

## Done-when criterion

| Criterion from the plan | Result |
|---|---|
| An unanswered request escalates to operations automatically | Met: a durable timer raises an in-app alert for network operations once, after the configured delay. |

Phase 7 adds role-scoped in-app notifications for referral submission and responses, transport
requests, provider offers, confirmations and declines, crew trip-status changes, handover, completion,
and overdue referral responses. Notifications are created in the same database transaction as the
action that caused them, are idempotent per recipient/event, and are visible only while the recipient
still holds the matching active role and scope.

Network administrators configure how many minutes an unanswered receiving-facility request may
remain pending before it is escalated to network operations. A database-backed worker checks due
requests every 15 seconds, atomically claims each escalation, and records the notification. A
request that has already been answered, withdrawn, or closed with the referral is not escalated.
The timer is durable across API restarts; simultaneous API instances cannot claim the same request.

The notification centre tracks in-app, SMS, push, and email independently. Configure
`POSTMARK_SERVER_TOKEN` and `POSTMARK_FROM_EMAIL` to queue email through Postmark's transactional
API. Email contains the notification text and a sign-in link, not patient details. `SENT` means
Postmark accepted the request; it does not confirm delivery to the recipient's mailbox. Provider
errors are recorded as `FAILED`. An interrupted send is not retried automatically because its
acceptance may be unknown; check Postmark before taking action.

SMS and push remain **unconfigured**. Configure these channels before relying on them for urgent
alerts. Provider credentials belong in deployment secrets, not source control.

Verification: the API E2E suite checks role-scoped delivery, privacy-minimal email content,
Postmark success and failure states, channel status, permission boundaries, and exactly-once
escalation. The settings change is recorded in the audit log.
