/**
 * Loads the demo: 3 branches, 12 officers, 3 branch managers, 1 head of collections, and
 * 150 days of simulated history (120 days of daily overdue files). Wipes existing data first.
 *
 *   npm run db:seed                 # anchored on today's date (IST)
 *   SEED_TODAY=2026-11-03 npm run db:seed
 */
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "../src/db/client";
import * as s from "../src/db/schema";
import { addDays, istDate, istInstant } from "../src/domain/time";
import { buildFeatures } from "../src/domain/scoring/features";
import { predict } from "../src/domain/scoring/model";
import { fillTemplate } from "../src/domain/messages";
import { BRANCHES, DEMO_PASSWORD, MANAGERS, OFFICERS } from "../src/server/demo/reference";
import { simulate } from "../src/server/demo/simulate";
import { factsFor, groupBy } from "../src/server/facts";
import { trainWithBacktest } from "../src/server/training";
import { rescoreAndAssign } from "../src/server/scoring";

async function insertChunks<T>(table: Parameters<typeof db.insert>[0], rows: T[], size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(table).values(rows.slice(i, i + size) as any);
  }
}

async function main() {
  const today = process.env.SEED_TODAY || istDate(new Date());
  const nowMs = process.env.SEED_TODAY ? istInstant(today, 17, 30).getTime() : Date.now();
  const t0 = Date.now();
  console.log(`Seeding demo data as of ${today} ...`);

  await db.execute(sql`TRUNCATE audit_log, messages, contact_attempts, promises, outcomes, snapshots, imports, model_versions, loans, users, branches RESTART IDENTITY CASCADE`);

  await db.insert(s.branches).values(BRANCHES.map((b) => ({ id: b.id, name: b.name, nameHi: b.nameHi })));
  const hash = await bcrypt.hash(process.env.SEED_PASSWORD ?? DEMO_PASSWORD, 10);
  await db.insert(s.users).values([
    ...OFFICERS.map((o, i) => ({
      id: o.id,
      name: o.name,
      email: o.email,
      passwordHash: hash,
      role: "officer" as const,
      branchId: o.branch,
      phone: `90011${String(10000 + i).slice(-5)}`,
      pincodes: [...o.pincodes],
      maxLoad: 25,
      locale: "hi" as const,
      lastSyncAt: new Date(nowMs - (i % 4) * 47 * 60_000),
    })),
    ...MANAGERS.map((m, i) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      passwordHash: hash,
      role: m.role,
      branchId: m.branch,
      phone: `90022${String(10000 + i).slice(-5)}`,
      locale: "en" as const,
    })),
  ]);

  const sim = simulate(today, { nowMs });
  console.log(`  simulated ${sim.loans.length} loans, ${sim.snapshots.length} daily rows, ${sim.outcomes.length} visits, ${sim.promises.length} promises`);

  // Train on the history exactly as the weekly job would, then replay its scores onto every
  // past day so the back-test compares what the model said with what actually happened.
  const loanStatic = sim.loans.map((l) => ({ id: l.id, missedEmis12m: l.missedEmis12m, monthsOnBook: l.monthsOnBook, lastImportDate: today }));
  const { params, metrics } = trainWithBacktest(sim.snapshots, loanStatic, sim.promises, sim.outcomes, sim.dataFrom, today);
  console.log(`  model: AUC ${metrics.auc?.toFixed(3)} on ${metrics.n} held-out rows`);

  const pBy = groupBy(sim.promises, (p) => p.loanId);
  const oBy = groupBy(sim.outcomes, (o) => o.loanId);
  const loanById = new Map(sim.loans.map((l) => [l.id, l]));
  const scoredSnapshots = sim.snapshots.map((sn) => {
    const l = loanById.get(sn.loanId)!;
    const facts = factsFor({ ...sn, missedEmis12m: l.missedEmis12m, monthsOnBook: l.monthsOnBook }, sn.asOfDate, pBy.get(sn.loanId), oBy.get(sn.loanId));
    const { p } = predict(params, buildFeatures(facts));
    return { ...sn, score: Math.round(p * 100), riskProbability: p };
  });

  await insertChunks(
    s.loans,
    sim.loans.map((l) => ({
      id: l.id,
      borrowerName: l.borrowerName,
      businessType: l.businessType,
      phone: l.phone,
      address: l.address,
      pincode: l.pincode,
      lat: l.lat,
      lng: l.lng,
      branchId: l.branchId,
      language: l.language,
      emiAmount: l.emiAmount,
      outstanding: l.outstanding,
      overdueAmount: l.overdueAmount,
      dpd: l.dpd,
      missedEmis12m: l.missedEmis12m,
      monthsOnBook: l.monthsOnBook,
      lastPaymentDate: l.lastPaymentDate,
      lastPaymentAmount: l.lastPaymentAmount,
      status: l.npa ? ("npa" as const) : l.overdue ? ("overdue" as const) : ("cured" as const),
      overdueSince: l.overdue ? l.entryDate : null,
      curedOn: l.overdue ? null : l.curedOn,
      lastImportDate: today,
      assignedOfficerId: l.overdue ? l.officerId : null,
    })),
  );
  await insertChunks(s.snapshots, scoredSnapshots, 1000);
  await insertChunks(
    s.outcomes,
    sim.outcomes.map((o) => ({ ...o, lateEntry: o.flags.includes("late_entry") })),
  );
  await insertChunks(
    s.promises,
    sim.promises.map(({ willKeep: _w, ...p }) => p),
  );
  await insertChunks(s.contactAttempts, sim.attempts, 1000);

  await db.insert(s.modelVersions).values({
    name: `logistic-${today}`,
    params,
    metrics,
    active: true,
    trainedAt: istInstant(addDays(today, -1), 23, 0),
  });

  // One import record per daily file.
  const importRows = [];
  for (let d = sim.dataFrom; d <= today; d = addDays(d, 1)) {
    const day = scoredSnapshots.filter((x) => x.asOfDate === d);
    importRows.push({
      asOfDate: d,
      fileName: `lms_overdue_${d.replace(/-/g, "")}.csv`,
      uploadedBy: null,
      rowsTotal: day.length,
      rowsOk: day.length,
      rowsRejected: 0,
      newlyOverdue: day.filter((x) => x.dpd === 1).length,
      createdAt: istInstant(d, 7, 5),
    });
  }
  await insertChunks(s.imports, importRows);

  // Reminders the system already sent (mock SMS) for recent promises.
  const branchPhone = Object.fromEntries(BRANCHES.map((b) => [b.id, b.phone]));
  const messages = sim.promises
    .filter((p) => p.promisedDate >= addDays(today, -14) && p.promisedDate <= addDays(today, 1) && p.createdAt < istInstant(addDays(p.promisedDate, -1), 9))
    .map((p, i) => {
      const l = loanById.get(p.loanId)!;
      const at = istInstant(addDays(p.promisedDate, -1), 9, 0);
      const vars = { name: l.borrowerName, loanId: l.id, amount: p.amount, date: p.promisedDate, branchPhone: branchPhone[l.branchId] };
      return {
        id: `seed-msg-${i}`,
        loanId: l.id,
        promiseId: p.id,
        recipient: "borrower" as const,
        channel: "sms" as const,
        language: l.language,
        templateId: "ptp_day_before",
        body: fillTemplate("ptp_day_before", l.language, vars),
        status: at.getTime() <= nowMs ? ("sent" as const) : ("scheduled" as const),
        source: "system" as const,
        scheduledFor: at,
        sentAt: at.getTime() <= nowMs ? at : null,
        createdAt: p.createdAt,
      };
    });
  await insertChunks(s.messages, messages);

  // Today's priority lists: same scoring and assignment code the daily import runs.
  const r = await rescoreAndAssign(db, today, { resetPins: true });
  console.log(`  scored ${r.scored} live loans, ${r.reassigned} reassigned`);
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s. Demo password for every account: ${process.env.SEED_PASSWORD ? "(from SEED_PASSWORD)" : DEMO_PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
