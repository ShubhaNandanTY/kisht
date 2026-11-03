# Kisht

Field collections for an NBFC: each morning's overdue file becomes a prioritised, explained list on every field officer's phone (Hindi first, works offline), outcomes are logged in three taps with GPS, borrower contact is blocked outside 8 am–7 pm and every attempt recorded, promises to pay are tracked with reminders, and managers see roll rates by branch the same day.

- **Design document:** [docs/TDD.pdf](docs/TDD.pdf)
- **Run, deploy, demo logins:** [deployment.md](deployment.md)

```bash
npm install
cp .env.example .env.local
npm run setup      # local embedded Postgres + demo data, no database install needed
npm run dev        # http://localhost:3000 (demo password: kisht-demo-2026)
npm test           # 69 unit and integration tests
```

## Layout

| Path | What is there |
|---|---|
| `src/domain/` | Business rules with no framework or database code: contact window, assignment, CSV parsing, promises, roll rates, scoring model, message templates and filter |
| `src/server/` | Database-backed services: import pipeline, scoring and assignment, offline sync, reminders, dashboards, demo simulation |
| `src/app/officer/` | Officer phone app (offline: IndexedDB + service worker in `public/sw.js`) |
| `src/app/manager/` | Manager and head-of-collections dashboard |
| `src/app/api/` | Route handlers (every one checks session and role) |
| `src/db/` | Drizzle schema and client (Neon Postgres in production, PGlite locally) |
| `scripts/` | Migrations, seed, simulation stats |
| `tests/` | Vitest unit tests and integration tests on in-memory Postgres |
