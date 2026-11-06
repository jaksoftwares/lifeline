# Afyaline

Afyaline connects **hospitals** and **ambulance providers** so a patient can be moved from one facility
to another quickly, safely and at a known cost, without the round of phone calls a transfer depends on today.

**Request → Accept → Ambulance → Track → Handover → Report**

The product flow, data model and implementation phases are in [docs/afyaline-plan.md](docs/afyaline-plan.md).

## Stack

Next.js (App Router) · Supabase (Postgres, Auth, Realtime) · Tailwind CSS · OpenStreetMap

## Getting started

Requires Node 24 and pnpm.

```bash
pnpm install
cp .env.example .env.local   # then fill in the values (see below)
pnpm db:push                 # create the database tables in Supabase
pnpm db:seed                 # optional: demo hospitals, ambulances, people and transfers
pnpm dev                     # http://localhost:3000
```

### Environment (`.env.local`)

| Variable                        | Where to find it                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Project Settings → API                                                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API                                                                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase → Project Settings → API (server only, never share)                                       |
| `SUPABASE_DB_URL`               | Supabase → **Connect** → _Session pooler_ connection string, with your database password filled in |
| `POSTMARK_API_TOKEN`            | Postmark → your server → API Tokens (empty = email off)                                            |
| `ADMIN_EMAILS`                  | Afyaline team addresses, comma-separated: told about new registrations                             |
| `EMAIL_FROM` (optional)         | Sender, verified in Postmark. Default `Afyaline <notifications@dovepeakdigital.com>`               |
| `APP_URL` (optional)            | Public address for links in emails. Detected automatically on Vercel                               |

## Database scripts

| Command              | What it does                                                         |
| -------------------- | -------------------------------------------------------------------- |
| `pnpm db:push`       | Applies new files in `supabase/migrations/` to the Supabase database |
| `pnpm db:seed`       | Replaces the demo data (all `@afyaline.example` accounts)            |
| `pnpm db:new <name>` | Creates a new, empty migration file                                  |

No CLI? Paste the files in `supabase/migrations/` into the Supabase **SQL Editor**, oldest first.

## Demo accounts

After `pnpm db:seed`, every demo account uses the password `Afyaline#2026`:

| Email                            | Who                                                         |
| -------------------------------- | ----------------------------------------------------------- |
| `admin@afyaline.example`         | Afyaline platform admin                                     |
| `kiambu@afyaline.example`        | Sending hospital (Kiambu Valley Hospital)                   |
| `metro@afyaline.example`         | Receiving hospital (Nairobi Metropolitan Referral Hospital) |
| `rapid@afyaline.example`         | Ambulance provider (Rapid Response Ambulance Services)      |
| `driver.akinyi@afyaline.example` | Ambulance driver (Rapid Response, free for live dispatch)   |

The investor presentation and live demo script is in [docs/mvp-presentation-guide.md](docs/mvp-presentation-guide.md).

## Deploy (Vercel)

1. Push the repository to GitHub, then in Vercel choose **Add New → Project** and import it.
   The defaults (Next.js, `pnpm build`) are correct.
2. Add the environment variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `POSTMARK_API_TOKEN` and `ADMIN_EMAILS`. `SUPABASE_DB_URL` is only needed on your machine for `db:push`.
   Optional: `OSRM_URL` for a self-hosted routing server.
3. Deploy. Drivers need the https address: phones only share location over https.

## Notifications

- **Live (in the app):** pages update instantly and alerts pop up with a chime for anyone who has Afyaline open.
- **Email (Postmark):** the people who need to act are emailed at each step: new request, accepted or declined,
  ambulance requested, dispatched (both hospitals and the driver), patient on the way, handed over (with the report
  link) and cancelled. Plus welcome emails on registration and when someone is added to a team.
  Emails carry the transfer code, urgency and service, never the patient's name or condition. Demo accounts
  (`@afyaline.example`) never receive mail.

## How it is built

- **The browser reads, the server writes.** Pages read data as the signed-in user through Postgres
  Row Level Security. Every change goes through a server action that checks the business rules.
- `supabase/migrations/`: the database schema (6 tables)
- `src/app/`: pages; `src/components/`: UI; `src/lib/`: Supabase clients, auth, shared logic
