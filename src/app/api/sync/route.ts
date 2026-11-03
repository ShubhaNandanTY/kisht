import { db } from "@/db/client";
import { syncBatch } from "@/domain/sync";
import { requireSession, serverNow } from "@/server/auth";
import { json, route } from "@/server/http";
import { applySyncBatch } from "@/server/sync";

export const POST = route(async (req: Request) => {
  const s = await requireSession(["officer"]);
  const { events } = syncBatch.parse(await req.json());
  // serverNow() is the real clock in production; with DEMO_MODE it follows the demo clock so
  // phone and server agree on what time it is.
  const results = await applySyncBatch(db, s, events, await serverNow());
  return json({ results });
});
