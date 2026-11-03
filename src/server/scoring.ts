import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { loans, modelVersions, outcomes, promises, snapshots, users } from "@/db/schema";
import { assignLoans } from "@/domain/assignment";
import { RULES_V0, type ModelParams } from "@/domain/scoring/model";
import { scoreLoan } from "@/domain/scoring/score";
import { addDays, istInstant } from "@/domain/time";
import { factsFor, groupBy } from "./facts";

export async function getActiveModel(db: DB): Promise<{ id: number | null; name: string; params: ModelParams }> {
  const [m] = await db.select().from(modelVersions).where(eq(modelVersions.active, true)).orderBy(desc(modelVersions.trainedAt)).limit(1);
  return m ? { id: m.id, name: m.name, params: m.params } : { id: null, name: "rules-v0", params: RULES_V0 };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Re-scores every live overdue loan and re-runs assignment. Called after each daily import,
 * after a retrain, and by the seed, so the demo data goes through the same path as production.
 */
export async function rescoreAndAssign(db: DB, asOfDate: string, opts: { resetPins?: boolean } = {}) {
  const model = await getActiveModel(db);
  const live = await db.select().from(loans).where(eq(loans.status, "overdue"));
  if (!live.length) return { scored: 0, reassigned: 0 };
  const ids = live.map((l) => l.id);
  const since = istInstant(addDays(asOfDate, -120), 0);

  const ps = await db
    .select({ loanId: promises.loanId, promisedDate: promises.promisedDate, status: promises.status, createdAt: promises.createdAt, resolvedAt: promises.resolvedAt })
    .from(promises)
    .where(inArray(promises.loanId, ids));
  const os = await db
    .select({ loanId: outcomes.loanId, type: outcomes.type, occurredAt: outcomes.occurredAt })
    .from(outcomes)
    .where(and(inArray(outcomes.loanId, ids), gte(outcomes.occurredAt, since)));
  const pBy = groupBy(ps, (p) => p.loanId);
  const oBy = groupBy(os, (o) => o.loanId);

  const scored = live.map((l) => {
    const r = scoreLoan(model.params, factsFor(l, asOfDate, pBy.get(l.id), oBy.get(l.id)));
    return { loan: l, ...r };
  });

  const officers = await db.select().from(users).where(eq(users.role, "officer"));
  const assignment = assignLoans(
    scored.map((s) => ({ id: s.loan.id, branchId: s.loan.branchId, pincode: s.loan.pincode, currentOfficerId: s.loan.assignedOfficerId, score: s.score })),
    officers.map((o) => ({ id: o.id, branchId: o.branchId ?? "", pincodes: o.pincodes, maxLoad: o.maxLoad, active: o.active })),
  );

  let reassigned = 0;
  const rows = scored.map((s) => {
    const a = assignment.get(s.loan.id)!;
    if (a.officerId !== s.loan.assignedOfficerId) reassigned++;
    const reasons = s.confidenceReason ? [...s.reasons, { key: s.confidenceReason, params: {}, impact: 0 }] : s.reasons;
    return { id: s.loan.id, score: s.score, p: s.probability, confidence: s.confidence, reasons, officerId: a.officerId, note: a.note };
  });

  for (const part of chunk(rows, 400)) {
    const values = sql.join(
      part.map((r) => sql`(${r.id}, ${r.score}::int, ${r.p}::real, ${r.confidence}, ${JSON.stringify(r.reasons)}::jsonb, ${r.officerId}, ${r.note})`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE loans AS l SET
        score = v.score, risk_probability = v.p, confidence = v.confidence, reasons = v.reasons,
        assigned_officer_id = v.officer_id, assignment_note = v.note,
        manager_rank = ${opts.resetPins ? sql`NULL` : sql`l.manager_rank`},
        updated_at = now()
      FROM (VALUES ${values}) AS v(id, score, p, confidence, reasons, officer_id, note)
      WHERE l.id = v.id`);
    await db.execute(sql`
      UPDATE snapshots AS s SET score = v.score, risk_probability = v.p, officer_id = v.officer_id
      FROM (VALUES ${values}) AS v(id, score, p, confidence, reasons, officer_id, note)
      WHERE s.loan_id = v.id AND s.as_of_date = ${asOfDate}`);
  }
  return { scored: rows.length, reassigned, model: model.name };
}
