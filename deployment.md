# Kisht: deployment and running guide

Repository: https://github.com/ShubhaNandanTY/kisht
Live demo: LIVE_URL_PENDING

## 1. Run it locally

Nothing to install apart from Node. Locally the app uses an embedded Postgres (PGlite, stored in `.data/`), so there is no database server to set up.

Requirements: Node.js 20 or newer, npm.

```bash
git clone https://github.com/ShubhaNandanTY/kisht.git
cd kisht
npm install
cp .env.example .env.local       # DEMO_MODE=true is already set
npm run setup                    # creates the local database, runs migrations, loads demo data (about 2 s)
npm run dev                      # http://localhost:3000
```

Open http://localhost:3000 and pick a demo account on the sign-in page.

To try it on a phone on the same Wi-Fi, open `http://<your-computer-ip>:3000`. GPS and the offline cache need HTTPS on a real phone, so use the deployed version for that (or a tunnel such as `npx localtunnel --port 3000`).

Other commands:

| Command | What it does |
|---|---|
| `npm test` | 69 unit and integration tests (Vitest; integration tests run against an in-memory Postgres) |
| `npm run typecheck` | TypeScript check |
| `npm run build && npm start` | Production build. Needs `SESSION_SECRET` in `.env.local`. The offline service worker only runs in this mode |
| `npm run setup` | Rebuilds the local database from scratch and reloads demo data. **Stop the dev server first**: the embedded database allows one process at a time |
| `npx tsx scripts/sim-stats.ts` | Prints the demo simulation's headline numbers and model metrics without touching the database |

The demo data is anchored on the day you run `setup`: it simulates the 150 days before today, so the three loans from the brief always show their stated DPD and promise dates relative to today. Override with `SEED_TODAY=2026-11-03 npm run db:seed`.

## 2. How it is deployed

- **Hosting:** Vercel (Next.js), region `bom1` (Mumbai), so borrower data stays in India and officers get low latency.
- **Database:** Neon Postgres, also in an India region, connected through `DATABASE_URL`. Same schema and migrations as local.
- **Migrations:** run automatically on every deploy (`vercel-build` = `tsx scripts/migrate.ts && next build`).
- **Scheduled job:** Vercel Cron calls `GET /api/cron/daily` at 03:30 UTC (9:00 am IST): imports the day's file if it has not been imported yet, settles promises, sends promise reminders. Configured in `vercel.json`.
- **Seeding the deployed database (once):** run the seed from your machine against the production database:

  ```bash
  DATABASE_URL="<neon connection string>" npm run db:migrate
  DATABASE_URL="<neon connection string>" npm run db:seed
  ```

### Steps to deploy your own copy

1. Fork or import the repository into Vercel (vercel.com/new). Framework: Next.js; the build command comes from `vercel.json`.
2. In the Vercel project, Storage, add **Neon Postgres** (Mumbai region if offered). This sets `DATABASE_URL`.
3. Add the environment variables listed below, then deploy.
4. Seed once with the commands above.

## 3. Environment variables

Names only; never commit values.

| Name | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Production | Postgres connection string. If empty, the embedded local database is used |
| `SESSION_SECRET` | Production | Signs session cookies and reminder-draft tokens. A long random string (`openssl rand -base64 32`) |
| `CRON_SECRET` | Production | Vercel Cron sends it as a Bearer token to `/api/cron/daily`; other callers are refused |
| `DEMO_MODE` | Optional | `true` shows the demo accounts on the sign-in page and the demo clock. Leave unset for a real rollout |
| `ANTHROPIC_API_KEY` | Optional | Turns on AI-personalised reminder drafts. Without it, officers get the approved template (the app is fully usable either way) |
| `SEED_PASSWORD` | Optional | Password for the seeded accounts instead of the demo default |
| `SEED_TODAY` | Optional | Anchor date for the demo data (`YYYY-MM-DD`) |
| `PGLITE_DIR` | Optional | Where the local embedded database is stored (default `.data/pglite`) |

## 4. Demo logins

All demo accounts use the password **`kisht-demo-2026`**. On the sign-in page, tap an account to sign in directly.

| Role | Name | Email | Use it to see |
|---|---|---|---|
| Field officer, Sanwer Road | Rahul Chouhan | `rahul@kisht.demo` | Company B (LN-10293) with its promise for the 5th |
| Field officer, Pithampur | Neha Solanki | `neha@kisht.demo` | Company C (LN-10871), 27 DPD, 4 days from rolling |
| Field officer, Siyaganj | Imran Qureshi | `imran@kisht.demo` | Company D (LN-11930) with its broken promise of the 31st |
| Branch manager, Sanwer Road | Priya Saxena | `priya@kisht.demo` | One branch only |
| Branch manager, Siyaganj | Anil Mehta | `anil@kisht.demo` | One branch only |
| Branch manager, Pithampur | Rakesh Dubey | `rakesh@kisht.demo` | One branch only |
| Head of collections | Meera Joshi | `meera@kisht.demo` | All branches, branch switcher, model retraining |

Other officers: `sunita`, `vikram`, `deepak`, `kavita`, `mohit`, `farhan`, `ajay`, `ritu`, `sanjay` (all `@kisht.demo`).

### Things to try (about 10 minutes)

1. **Officer, phone width.** Sign in as Rahul. The list is in Hindi (EN toggle at top). Open Company B, then log an outcome: Log outcome, then Promise, then Save (three taps; date and amount are prefilled).
2. **Contact rule.** In the ⋯ menu choose Demo clock, 7:30 pm. The header turns red; tapping Call explains the RBI rule and records the blocked attempt. Logging an outcome now asks when the contact happened (8 am to 7 pm only). Set the clock back to Real time afterwards.
3. **Offline.** In a production build (`npm run build && npm start`) or the live site, load the officer app, switch the phone or browser to offline, log a visit (it shows "Saved on phone" and a pending count), then go back online: it syncs by itself.
4. **Reminder.** Open a borrower and tap Reminder: the approved template for that loan's situation, in the borrower's language. Outside 8 am to 7 pm the send is blocked and recorded.
5. **Manager.** Sign in as Meera. Overview shows the roll rate against the 16% target, by branch, with model projections for loans still maturing. Team & lists, then an officer: pin or reorder loans, reassign, see the visit map. Daily import: download the sample file with errors and upload it to see row-level validation and the partial-file guard. Priority model: the held-out back-test, calibration and weights.

## 5. Notes

- Messages (SMS/WhatsApp) are mocked: sends are stored in the `messages` table with status `sent`, `scheduled` or `blocked`. No real message leaves the app.
- The loan management system is mocked by `src/server/mockLoanSystem.ts`, which produces the day's overdue CSV in the same format a manager can upload; it goes through the same import code.
- All names, phone numbers and addresses in the demo data are invented. The three sample loans use the names from the brief (Company B, C, D).
