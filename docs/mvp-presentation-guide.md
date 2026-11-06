# Afyaline MVP presentation guide

A 20-minute investor presentation built around one live patient transfer, from "we need a bed" to "patient handed over", followed by the numbers.

| Part                        | Time   | What happens                                           |
| --------------------------- | ------ | ------------------------------------------------------ |
| 1. The problem              | 2 min  | Landing page                                           |
| 2. The solution             | 2 min  | How it works, who uses it                              |
| 3. Live demo                | 10 min | One transfer across three laptop windows and one phone |
| 4. The numbers              | 3 min  | Dashboards and reports                                 |
| 5. Business model and pilot | 2 min  | How Afyaline earns and rolls out                       |
| 6. Close                    | 1 min  | The ask                                                |
| Q&A                         | open   | Prepared answers below                                 |

---

## 1. Demo accounts

Every demo account uses the password **`Afyaline#2026`**.

### The four accounts used in the live demo

| Screen          | Email                            | Who                                                                       | Data behind it                                                           |
| --------------- | -------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Laptop window 1 | `kiambu@afyaline.example`        | Dr. Peter Kamau, **Kiambu Valley Hospital** (sends the patient)           | 21 transfers: 12 sent, 9 received. One transfer in progress.             |
| Laptop window 2 | `metro@afyaline.example`         | Dr. Achieng Otieno, **Nairobi Metropolitan Referral Hospital** (receives) | 35 transfers received. 4 in progress, with ambulances moving on the map. |
| Laptop window 3 | `rapid@afyaline.example`         | Mary Wambui, **Rapid Response Ambulance Services**                        | 45 trips, 3 ambulances. One request waiting.                             |
| **Phone**       | `driver.akinyi@afyaline.example` | Lilian Akinyi, **driver** (Rapid Response)                                | Free, ready to be dispatched live.                                       |

### For the numbers section

| Email                    | Shows                                                                   |
| ------------------------ | ----------------------------------------------------------------------- |
| `admin@afyaline.example` | **Network overview**: every hospital and provider, network-wide reports |

### Extra accounts, if asked to show more

| Email                            | Who                           | Useful for                                                                          |
| -------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| `thika@afyaline.example`         | Thika Junction Hospital       | 22 transfers. A patient on board right now.                                         |
| `machakos@afyaline.example`      | Machakos Hills Hospital       | 22 transfers, sent and received evenly                                              |
| `county@afyaline.example`        | Kiambu County Emergency Fleet | A county-run fleet. 19 trips.                                                       |
| `driver.otieno@afyaline.example` | Brian Otieno, driver          | A trip **in progress** with the patient on board (shows the driver screen mid-trip) |

The hospital and provider names are fictional and the history is generated demo data.

---

## 2. Preparation

### The day before

- [ ] Deploy and open the **https** address on a laptop and on the phone. Phones only share location over https.
- [ ] Sign in once with each of the four demo accounts to confirm they work.
- [ ] On the phone, open the address and use **Add to Home Screen**, so the driver app opens like a native app.
- [ ] Practise the live demo once, end to end, then reset (see "Resetting" below).

### 15 minutes before

- [ ] Open **three separate browser profiles** on the laptop (or one normal window and two incognito windows). Each needs its own sign-in.
- [ ] Window 1: Kiambu. Window 2: Metro. Window 3: Rapid. Phone: Lilian (`driver.akinyi`), on **My trip**. Allow location when asked.
- [ ] **Click once anywhere in each laptop window.** Browsers only play the alert chime after a click on the page.
- [ ] Turn the laptop sound on.
- [ ] As Rapid, open **Fleet & drivers** and check that **KDA 101A** shows _Available_. It is the ambulance you will dispatch.
- [ ] **Do not dispatch** the waiting request (AFY-00132, Peter Wairimu) before the demo. It would use Rapid's only free ambulance.
- [ ] Open the landing page in window 1 to start.

---

## 3. The presentation (talk track in _italics_)

### Part 1. The problem (2 min). Landing page

Scroll to the dark section with the four figures.

_"When a hospital in Kenya needs to transfer a critical patient, a doctor phones hospital after hospital looking for a bed, then phones again for an ambulance. Only 25 public hospitals offer ICU care, and 90% of Level 4 hospitals have no ICU or HDU, so finding the right bed is hard. Ambulance response can reach 60 minutes against a 15–20 minute target. And nobody sees the whole journey, so nobody can measure it or improve it."_

_"Kenya's problem is coordination more than capacity."_

### Part 2. The solution (2 min). "How it works" on the landing page

_"Afyaline puts the referring hospital, the receiving hospital and the ambulance provider in one live workflow. Four steps: find a bed, get acceptance before the patient moves, dispatch the right ambulance, and track it to the door. Every step is timed and every shilling is counted, automatically."_

_"It is a web app. Hospitals use it on any computer, and drivers use it on any phone, with no app store. Hospitals and ambulance providers register themselves in two minutes."_

### Part 3. Live demo (10 min)

**Step 1. Find a bed (2 min). Window 1, Kiambu**

1. Click **New transfer**.
2. Enter the patient:
   - Full name: **Mary Wanjiku**, age **34**, sex **Female**
   - Urgency: **Critical**
   - Condition: **Eclampsia at 34 weeks, seizures controlled**
3. Under **Service needed**, choose **Maternity**. The hospitals with free maternity beds appear, nearest first, each with its distance, bed count and a call button.
4. Choose **Nairobi Metropolitan Referral Hospital** and click **Send transfer request**.

_"That replaced five phone calls. The hospital we chose has already been alerted, and the team gets an email too."_

**Step 2. Accept (1 min). Window 2, Metro**

1. The alert pops up with a chime: _New transfer request: Mary Wanjiku_. Click **Open**.
2. Point out the patient brief, urgency and the sending hospital's call button.
3. Click **Accept patient**.

_"The patient is accepted before they move. If Metro had no bed, they would decline with a reason, and Kiambu would pick the next hospital in seconds."_

**Step 3. Request an ambulance (1 min). Window 1, Kiambu**

1. The alert pops up: _Mary Wanjiku was accepted_. The page now lists available ambulances, nearest first.
2. _"Because the patient is critical, Afyaline only shows ambulances with life-support equipment."_
3. Select **KDA 101A · Critical care** (Rapid Response) and click **Request this ambulance**.

**Step 4. Dispatch (1 min). Window 3, Rapid**

1. The alert pops up: _Ambulance requested_. Open it.
2. Ambulance: **KDA 101A**. Driver: **Lilian Akinyi**. Click **Confirm & dispatch**.

_"The provider confirms in one tap. Drivers already on a trip are not offered."_

**Step 5. The trip (3 min). The phone**

1. Pick up the phone. The trip has arrived with a chime: the patient, the pickup (A), the destination (B), the route and distance.
2. Point out the **Navigate** button (opens Google Maps directions) and the **Call** buttons.
3. Tap **Start trip to pickup**.
4. On the laptop, open the transfer in window 1 or 2: the **live map** shows the ambulance and the time to arrival.

   _"Both hospitals see the ambulance live. Nobody phones the driver asking 'where are you?'."_

5. On the phone, tap **Patient is onboard**. Under **Trip costs**, enter consumables **3500** and tap **Save costs**.
6. Window 2 (Metro) gets the alert: _Mary Wanjiku is on the way to you_.
7. On the phone, tap **Arrived at hospital**.

**Step 6. Handover (2 min). Window 2, Metro**

1. The alert pops up: _Mary Wanjiku has arrived. Confirm handover._
2. **Received by** is already filled in. Condition: **Stable**. Click **Confirm handover**.
3. Show the summary: total time from request to handover, time to acceptance, distance, fuel (calculated automatically), consumables, total cost.
4. Click **Transfer report**: a one-page record of the whole journey, with **Print / Save as PDF**.

_"Every transfer now leaves a complete, auditable record: who did what, when, how far, and what it cost."_

### Part 4. The numbers (3 min)

1. Window 1 (Kiambu): open **Dashboard**, then **Reports**.
   - Point out: median time from request to handover, time to acceptance, the time per stage, cost per transfer, where patients went.
   - Switch between **7 / 30 / 90 days**. Mention **Export CSV**.
2. Sign in as `admin@afyaline.example` (or use a fourth window) to show the **Network overview**: transfers completed, the acceptance rate, hospitals and ambulances on the network, then network-wide **Reports**.

_"Counties and hospitals have never had this data. Every minute of delay and every shilling spent is now visible, by hospital, by provider and by county. That's what drives better decisions on beds, fleets and budgets."_

Be clear that these figures come from generated demo data. They show what Afyaline measures, not pilot results.

### Part 5. Business model and pilot (2 min)

_"Afyaline is institution-funded infrastructure, not a fee charged to patients."_

- **County subscriptions:** counties coordinate referrals across their facilities.
- **Hospital licensing:** public and private hospitals and hospital networks.
- **Implementation and integration services:** onboarding, training, and HIS/EMR integration.
- **Analytics services:** referral and transport performance insight for counties and networks.

_"We pilot in four phases around one referral centre, for example KNH: first a baseline of how transfers work today, then validating the workflow, then a controlled pilot with selected hospitals and ambulance providers, then expansion."_

### Part 6. Close (1 min)

_"Afyaline turns a chain of phone calls into one visible, measurable journey that saves time, money and lives. The product works today, end to end. What we need now is [your ask: funding, a pilot partner, county introductions]."_

---

## 4. Q&A: prepared answers

**Is patient data safe?**
Each transfer is visible only to the two hospitals and the ambulance provider involved, enforced in the database itself. Emails never contain the patient's name or condition, and CSV exports exclude names. The design follows the Kenya Data Protection Act's principle of collecting the minimum.

**What if the internet is poor?**
Everything is a lightweight web page that works on basic smartphones and 3G. Every screen has call buttons, so staff can always fall back to the phone without losing the record.

**How is this different from 922?**
922 handles emergencies from the scene to a hospital. Transfers between facilities are still managed by counties, by phone. Afyaline covers that gap, and could hand trips to 922 or county fleets later.

**Does the route account for traffic?**
Not yet. Today's routing uses OpenStreetMap roads and picks the fastest route without live traffic. Traffic-aware routing (Google) is the planned next step.

**How do you know it saves time?**
Afyaline records every step automatically. The pilot's first phase measures today's phone-based baseline, so the saving is calculated from real data, not assumed.

**Is it hard to adopt?**
A hospital or provider registers in two minutes. Staff need one screen each, and drivers need a phone.

**What does it cost?**
Pricing is a subscription per county or hospital network, based on facilities, volumes and support. It's finalised with pilot partners. (Give figures only if your team has agreed them.)

**What exists today versus what's planned?**
Working today:

- hospital and provider registration
- bed availability
- transfer requests, acceptance and redirection
- ambulance dispatch
- the driver app with routing and live tracking
- handover, automatic costs and transfer reports
- dashboards and CSV export
- real-time alerts and email notifications

Planned:

- traffic-aware routing
- SMS/WhatsApp alerts
- HIS/EMR integration
- 922 and county dispatch links
- manual verification of new organizations

---

## 5. If something goes wrong

| Problem                              | What to do                                                                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An alert didn't appear               | Pages update on their own. Open **Transfers** and click the transfer.                                                                                                              |
| No chime                             | Click once in that window. Browsers block sound until the page is clicked.                                                                                                         |
| The phone isn't sharing location     | Check the site's location permission and that the address is **https**. The rest of the demo still works. Say "location on" and carry on.                                          |
| KDA 101A is not offered              | It's on another trip. Use **Urgent** instead of Critical, and choose a County ambulance with driver **Patrick Wekesa** (sign in on the phone as `driver.wekesa@afyaline.example`). |
| "This transfer has already moved on" | Someone clicked twice. Read the status on screen and continue.                                                                                                                     |
| Something is badly stuck             | Switch to the extra accounts above (Thika, `driver.otieno`) to show a transfer already in progress, then go to the numbers.                                                        |

## 6. Resetting after a rehearsal

Run `pnpm db:seed` to restore all demo data: a fresh month of history, one waiting request, and free drivers and ambulances.

**Warning:** the reset deletes every transfer that involves a demo organization, including any test transfers your own accounts sent to demo hospitals. Your own organizations and accounts are kept.

## 7. Claims to avoid

- Don't call the demo figures results. They are generated to show what Afyaline measures.
- Don't promise traffic-aware routing today.
- The problem figures come from the Afyaline problem statement. Check each source before presenting.
