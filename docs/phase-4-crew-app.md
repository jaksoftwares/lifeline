# Phase 4 — Crew mobile app

**Status:** Complete, pending review on a device\
**Date:** 1 November 2026\
**Plan reference:** [implementation-plan.md](implementation-plan.md), section 7, Phase 4

## Done-when criterion

| Criterion from the plan | Result |
|---|---|
| Status updates sync correctly after an offline period | Met in the API and the app's sync engine; not yet tried on a phone. An end-to-end test sends one batch, as the app would after 40 minutes with no signal: seven button presses (On our way, At pickup, Patient on board, Leaving, a reported flat tyre, Continuing, Arrived) and 40 positions. Meanwhile the dispatcher had recorded the departure from the web. The server accepts the crew's departure as already recorded, applies the other six in order **at the times they were pressed**, records when each actually arrived, stores the positions and moves the vehicle's last known position. Sending the same batch again (a lost response) records nothing twice. The app's queue is tested separately: presses survive an app restart while offline, are sent in order when the signal returns, and conflicts are kept for the crew to read. The same flow ran against the live API |

## What was built

### The crew app (`apps/mobile`, Expo SDK 58, React Native 0.88)
- **Sign-in** with the same accounts as the website, including the first-time password change and two-step codes. Tokens are kept in the phone's secure storage and refreshed automatically. Accounts without the ambulance crew role are turned away. Two-step setup is done on the website.
- **My trips**: every trip the crew member is on, with urgency, patient, route and status. Pull down to refresh.
- **Trip screen**: one large button for the next step, confirmed before it is recorded (On our way → Arrived at pickup → Patient on board → Leaving for destination → Arrived at destination). "Report a problem" with a short note while carrying the patient, then "Continue the journey". Call and directions buttons for both facilities and dispatch. The screen stays on during a trip.
- **Works offline.** Every press is saved on the phone first, shown straight away as "saved on this phone", and sent when there is signal, with the time it was pressed. Sending happens on reconnect, when the app comes back to the foreground, and on a timer.
- **Shares location during trips only**, from dispatch until arrival, including in the background. Android shows a notification while it does. Positions are queued offline like presses; up to 2,500 are kept (over 20 hours at one every 30 seconds).
- **Always-visible status strip**: online or not, how many updates are waiting, when the last sync happened, and whether location is allowed always, only while open, or not at all (with a button to fix it).
- **Conflicts explained**: if an update can't be recorded, e.g. the dispatcher changed the crew while the phone was offline, the crew sees which update and why, and is told to call dispatch.

### API
- **Crew-app sign-in**: with the `X-Lifeline-Client: mobile` header, sign-in returns tokens in the body instead of cookies, and `POST /auth/mobile/refresh` rotates them. Reusing an old refresh token after the grace window ends the session, as on the web.
- `GET /crew/trips`: the crew member's confirmed trips.
- `POST /crew/sync`: the app's whole queue in one request (up to 100 presses and 500 positions). Each press is judged against the transfer as it stands now:
  - **Applied**, at the device time of the press.
  - **Duplicate**: the same press was received before (each press carries an id made on the phone).
  - **Already recorded**: the transfer had already reached that step, e.g. the dispatcher recorded it. Not an error.
  - **Rejected**, with a reason the crew can read: no longer on this trip (crew or vehicle changed), trip ended (released, taken back or cancelled), or out of order.
- A device clock more than 5 minutes ahead is ignored and the time received is used.
- Positions are stored only for trips the crew member is on, only between confirmation and the end of the trip, and duplicates are skipped. The vehicle's last known position only moves forward in time.
- Every crew update is audited with how late it arrived.

### Web
- Transfer history shows crew updates, marking those recorded offline with when they arrived.
- The transfer card shows dispatch, pickup, collection and arrival times.
- Once the ambulance has reached the patient, the dispatcher's change and release buttons give way to "the crew is updating this trip".

### Database
- Transfer history gains the time received, the source (web or crew app) and the press id (unique, so retries can't double-record).
- Transfers gain pickup, collection and arrival times.
- New append-only position table, unique per trip and fix time.

## Decisions taken during Phase 4

| Decision | Reason |
|---|---|
| Device time is the time of record; time received is stored beside it | Response times must reflect when things happened on the road, not when the phone found signal |
| One sync request for the whole queue | One round trip is enough when signal comes and goes |
| An update for a step already passed is accepted, not rejected | Dispatchers record departures by radio when crews can't; the crew's late update agrees and shouldn't alarm anyone |
| Presses are confirmed with a dialog | A mistaken tap is shared with both facilities at once |
| Tokens in the response body only when the app asks | Browsers keep using httpOnly cookies; tokens never reach web pages |
| Handover isn't recorded in the app | Handover is confirmed by the receiving team in Phase 6. Until then, a trip ends at "Arrived" and the vehicle stays on the trip |
| Expo SDK 58 patch releases under two weeks old are held back | The two-week release rule. `expo-doctor` reports these as patch mismatches until they age. TypeScript stays on 5.9.3 like the rest of the repo; SDK 58 suggests 6.0 |
| Transitive Expo packages pinned with pnpm overrides | Keeps one copy of each native module, which native builds require |

## Running the app

The app needs a development build (not Expo Go), because background location requires native configuration.

```sh
pnpm infra:up && pnpm dev                     # API on :4000
cd apps/mobile
npx expo run:android                          # builds and installs on an emulator or a USB-connected phone
```

The Android emulator reaches your computer's API at `10.0.2.2:4000`, the default in `app.json`. For a real phone on the same Wi-Fi, set `EXPO_PUBLIC_API_URL=http://<your computer's IP>:4000/api` before starting. Sign in as `crew@demo.lifeline.test` (password `Lifeline-Demo-2026`); his trips appear once a dispatcher confirms one with Kevin Ochieng in the crew.

To try offline: put the phone in flight mode mid-trip, press a few steps, then turn flight mode off.

## Verified, and not yet verified

- Verified: API end-to-end tests (13 new), sync-queue unit tests (7), typecheck, lint, and a full Android bundle with Metro (1,293 modules).
- **Not yet verified on a phone or emulator**: screens, background location, permission prompts and the Android notification were not run here, because this machine has no emulator. Running through the flow above on an Android phone is the first step of Phase 4 review.

## Follow-ups

1. **Run on real Android phones**, including low-end ones common among county crews, and on iOS.
2. **Push notifications** for new trips and changes (Phase 7).
3. **Live map** of positions for facilities and operations, with stale-location warnings (Phase 5).
4. **Handover** and completion, which free the vehicle (Phase 6).
5. Dispatchers recording trip steps on the crew's behalf from the web, for crews without phones.
6. Positions from a crew member removed from a trip are dropped, including fixes recorded before the change. Acceptable for now; revisit if it hides real movement.
