/**
 * Loads the demo: 3 branches, 12 officers, 3 branch managers, 1 head of collections, and
 * 150 days of simulated history (120 days of daily overdue files). Wipes existing data first.
 *
 *   npm run db:seed                 # anchored on today's date (IST)
 *   SEED_TODAY=2026-11-03 npm run db:seed
 */
// Pick up DATABASE_URL etc. from .env.local, as Next.js does (existing env vars win).
try {
  process.loadEnvFile(".env.local");
} catch {}

import { db } from "../src/db/client";
import { istDate, istInstant } from "../src/domain/time";
import { DEMO_PASSWORD } from "../src/server/demo/reference";
import { seedDemo } from "../src/server/demo/seedDemo";

const today = process.env.SEED_TODAY || istDate(new Date());
const nowMs = process.env.SEED_TODAY ? istInstant(today, 17, 30).getTime() : Date.now();

seedDemo(db, { today, nowMs, password: process.env.SEED_PASSWORD || DEMO_PASSWORD, log: console.log })
  .then(() => {
    console.log(`Demo password for every account: ${process.env.SEED_PASSWORD ? "(from SEED_PASSWORD)" : DEMO_PASSWORD}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
