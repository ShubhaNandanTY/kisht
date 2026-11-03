import { timingSafeEqual } from "node:crypto";
import { db } from "@/db/client";
import { json, route } from "@/server/http";
import { runDailyJobs } from "@/server/reminders";

export const maxDuration = 60;

// Vercel Cron calls this at 03:30 UTC (9:00 IST) with "Authorization: Bearer $CRON_SECRET".
export const GET = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return json({ error: "unauthorized" }, 401);
  }
  return json(await runDailyJobs(db, new Date()));
});
