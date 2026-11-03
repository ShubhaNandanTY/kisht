import { db } from "@/db/client";
import { syncBatch } from "@/domain/sync";
import { requireSession } from "@/server/auth";
import { json, route } from "@/server/http";
import { applySyncBatch } from "@/server/sync";

export const POST = route(async (req: Request) => {
  const s = await requireSession(["officer"]);
  const { events } = syncBatch.parse(await req.json());
  // Received time is always the real server clock: the demo clock must not be able to forge contact times.
  const results = await applySyncBatch(db, s, events, new Date());
  return json({ results });
});
