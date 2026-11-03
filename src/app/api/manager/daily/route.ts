import { db } from "@/db/client";
import { requireSession, serverNow } from "@/server/auth";
import { json, route } from "@/server/http";
import { runDailyJobs } from "@/server/reminders";

export const maxDuration = 60;

export const POST = route(async () => {
  await requireSession(["manager", "head"]);
  return json(await runDailyJobs(db, await serverNow()));
});
