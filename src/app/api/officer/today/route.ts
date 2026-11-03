import { db } from "@/db/client";
import { requireSession, serverNow } from "@/server/auth";
import { json, route } from "@/server/http";
import { officerDay } from "@/server/officer";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const s = await requireSession(["officer"]);
  return json(await officerDay(db, s.sub, await serverNow()));
});
