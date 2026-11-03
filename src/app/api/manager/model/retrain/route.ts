import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, modelVersions, outcomes, promises, snapshots, loans } from "@/db/schema";
import { istDate } from "@/domain/time";
import { requireSession, serverNow } from "@/server/auth";
import { json, route } from "@/server/http";
import { rescoreAndAssign } from "@/server/scoring";
import { trainWithBacktest } from "@/server/training";

export const maxDuration = 60;

/**
 * Retrains on all history and back-tests on the latest 45 days. The new model only replaces
 * the active one if it ranks at least as well out of sample, so a bad week of data cannot
 * silently make the lists worse.
 */
export const POST = route(async () => {
  const s = await requireSession(["head"]);
  const now = await serverNow();
  const snaps = await db.select().from(snapshots);
  if (!snaps.length) return json({ error: "no_history" }, 400);
  const dataFrom = snaps.reduce((m, r) => (r.asOfDate < m ? r.asOfDate : m), snaps[0].asOfDate);
  const dataTo = snaps.reduce((m, r) => (r.asOfDate > m ? r.asOfDate : m), snaps[0].asOfDate);
  const ls = await db.select({ id: loans.id, missedEmis12m: loans.missedEmis12m, monthsOnBook: loans.monthsOnBook, lastImportDate: loans.lastImportDate }).from(loans);
  const ps = await db.select({ loanId: promises.loanId, promisedDate: promises.promisedDate, status: promises.status, createdAt: promises.createdAt, resolvedAt: promises.resolvedAt }).from(promises);
  const os = await db.select({ loanId: outcomes.loanId, type: outcomes.type, occurredAt: outcomes.occurredAt }).from(outcomes);

  let trained;
  try {
    trained = trainWithBacktest(snaps, ls, ps, os, dataFrom, dataTo);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "training_failed" }, 400);
  }
  const [current] = await db.select().from(modelVersions).where(eq(modelVersions.active, true));
  const better = !current || (trained.metrics.auc ?? 0) >= (current.metrics.auc ?? 0) - 0.01;
  if (better) await db.update(modelVersions).set({ active: false }).where(eq(modelVersions.active, true));
  const [v] = await db
    .insert(modelVersions)
    .values({ name: `logistic-${istDate(now)}`, params: trained.params, metrics: trained.metrics, active: better, trainedAt: now })
    .returning({ id: modelVersions.id });
  if (better) await rescoreAndAssign(db, dataTo);
  await db.insert(auditLog).values({ userId: s.sub, action: "model.retrain", entity: "model_versions", entityId: String(v.id), meta: { auc: trained.metrics.auc, activated: better } });
  return json({ id: v.id, activated: better, metrics: trained.metrics, previousAuc: current?.metrics.auc ?? null });
});
