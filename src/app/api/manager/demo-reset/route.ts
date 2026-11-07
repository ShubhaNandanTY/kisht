import { cookies } from "next/headers";
import { db } from "@/db/client";
import { istDate } from "@/domain/time";
import { CLOCK_COOKIE } from "@/lib/clock";
import { demoMode, requireSession } from "@/server/auth";
import { DEMO_PASSWORD } from "@/server/demo/reference";
import { seedDemo } from "@/server/demo/seedDemo";
import { json, route } from "@/server/http";

export const maxDuration = 60;

/**
 * Demo only: rebuilds the demo data anchored on today, so a reviewer opening the app days after
 * it was seeded still sees the brief's three loans exactly as described. Head of collections only.
 */
export const POST = route(async () => {
  if (!demoMode()) return json({ error: "not_found" }, 404);
  await requireSession(["head"]);
  const now = new Date();
  const result = await seedDemo(db, { today: istDate(now), nowMs: now.getTime(), password: process.env.SEED_PASSWORD || DEMO_PASSWORD });
  (await cookies()).delete(CLOCK_COOKIE);
  return json({ ok: true, ...result });
});
