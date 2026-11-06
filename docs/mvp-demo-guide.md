# Lifeline demo: presenter guide

## Open the demo

**Link:** [Open Lifeline](https://fc7a-197-254-8-98.ngrok-free.app/login)

If a page asks, click **Visit Site** to continue.

**Password for the demo accounts:** `Lifeline-Demo-2026`

Use the same password for each account below. If it does not work, contact the person who set up
the demo; do not try to reset or reinstall anything.

Use fictional demo records only. Do not enter or read aloud real patient information.

## Present in this order

For each step, sign out of the previous account using the account menu, then sign in with the next
email and the shared password.

### 1. Clinician — start at Overview

**Sign in:** `clinician.north@demo.lifeline.test`

- **Overview:** introduce the referral, transfer, and notification summaries.
- **Referrals** → **Sent by my facility:** open the referral waiting for KNH.
- On the referral, show the urgency, clinical summary, receiving request, and history.

**Purpose:** show how a referring hospital starts and follows a patient referral.

### 2. KNH receiving team — accept the referral

**Sign in:** `receiving.national@demo.lifeline.test`

- **Referrals** → **Received:** open the request from Pumwani.
- Show the available choices: accept, ask for more information, or decline.
- For this demo, choose **Accept referral**.

**Purpose:** show the receiving hospital reviewing and responding to a referral.

### 3. Referring clinician — arrange an ambulance

**Sign in again:** `clinician.north@demo.lifeline.test`

- Return to the accepted referral.
- In **Arrange transport**, choose **Find an ambulance**.
- Review the ambulance suggestions and select an available vehicle.
- Choose **Offer** to send the trip to its ambulance provider.

**Purpose:** show how Lifeline matches transport to a referral and sends an offer.

### 4. Ambulance dispatcher — confirm the trip

Check the provider name on the offer. Sign in with the matching dispatcher:

- **Demo Ambulance Services:** `dispatcher@demo.lifeline.test`
- **Demo County Ambulance Service:** `dispatcher.county@demo.lifeline.test`

Then:

- Open **Transfers** → **Dispatch** and select the new offer.
- Choose an available vehicle and crew member; confirm the trip.
- Select **Mark as dispatched**.

**Purpose:** show the ambulance provider accepting responsibility for the trip and dispatching it.

### 5. Network operations — show the wider picture

**Sign in:** `operations@demo.lifeline.test`

- **Operations:** show transfer stages and items needing attention across the network.
- **Transfers:** open the trip to show its current status and history.
- **Notifications:** show in-app alerts.

**Purpose:** show how operations staff oversee transfers across participating facilities.

## Optional screens

- **Crew app:** it is a separate phone app, not part of this web link. Skip it unless it has already
  been installed and prepared.
- **Reports and administration:** these require a network administrator account,
  `network.admin@demo.lifeline.test`, and may ask for an authenticator code. Skip these if that
  account has not already been set up.

## If the screen does not match

- If the referral waiting for KNH is not there, open another Pumwani referral or move on to the
  ambulance step using the accepted referral already listed for Mama Lucy.
- If no ambulance is suggested, or the offer is not visible, skip that step and continue with
  **Operations**. The demonstration vehicle data may be out of date.
- The ambulance map shows a live location only when the separate crew app is sending GPS. Do not
  describe an estimate as a live location.
- The link works only while the host computer, app, and internet connection are on. If the link
  stops working, ask the demo organiser for a refreshed link.

## Remember

Hospital names are recognizable, but the people, referrals, capacity, ambulance details, and
contact information shown are examples. Lifeline is an MVP demonstration, not a clinical decision
tool. SMS and push alerts are not enabled.
