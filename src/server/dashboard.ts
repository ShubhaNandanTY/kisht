import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { branches, contactAttempts, imports, loans, messages, modelVersions, outcomes, promises, snapshots, users } from "@/db/schema";
import { episodes, rollRates, trailingRollRate, type Snap } from "@/domain/rollRate";
import { nextBucket } from "@/domain/scoring/features";
import { auc, evaluate } from "@/domain/scoring/model";
import { addDays, daysBetween, istDate, istInstant } from "@/domain/time";
import { latestImportDate } from "./imports";

export const ROLL_TARGET = 0.16;
export const ROLL_BASELINE = 0.22;

async function loadSnaps(db: DB, branchId: string | null): Promise<{ snaps: Snap[]; from: string | null; to: string | null }> {
  const rows = await db
    .select({ asOfDate: snapshots.asOfDate, loanId: snapshots.loanId, branchId: snapshots.branchId, dpd: snapshots.dpd })
    .from(snapshots)
    .where(branchId ? eq(snapshots.branchId, branchId) : undefined);
  if (!rows.length) return { snaps: [], from: null, to: null };
  let from = rows[0].asOfDate;
  let to = rows[0].asOfDate;
  for (const r of rows) {
    if (r.asOfDate < from) from = r.asOfDate;
    if (r.asOfDate > to) to = r.asOfDate;
  }
  return { snaps: rows, from, to };
}

export async function overview(db: DB, branchId: string | null, now: Date) {
  const today = istDate(now);
  const fileDate = await latestImportDate(db);
  const allBranches = await db.select().from(branches).orderBy(asc(branches.name));
  const scope = branchId ? allBranches.filter((b) => b.id === branchId) : allBranches;
  const { snaps, from, to } = await loadSnaps(db, branchId);

  const live = await db
    .select({ id: loans.id, risk: loans.riskProbability, dpd: loans.dpd, branchId: loans.branchId })
    .from(loans)
    .where(and(eq(loans.status, "overdue"), branchId ? eq(loans.branchId, branchId) : undefined));
  const riskByLoan = new Map(live.map((l) => [l.id, l.risk ?? 0.22]));

  const monthly = from && to ? rollRates(snaps, { period: "month", byBranch: true, dataFrom: from, dataTo: to, riskByLoan }) : [];
  const monthlyAll = from && to ? rollRates(snaps, { period: "month", byBranch: false, dataFrom: from, dataTo: to, riskByLoan }) : [];
  const weeklyAll = from && to ? rollRates(snaps, { period: "week", byBranch: false, dataFrom: from, dataTo: to, riskByLoan }) : [];

  const byBranch = scope.map((b) => {
    const trailing = from && to ? trailingRollRate(snaps, from, to, b.id) : null;
    const rows = monthly.filter((r) => r.branchId === b.id);
    const current = rows.filter((r) => !r.matured);
    const entrants = current.reduce((s, r) => s + r.entrants, 0);
    const projected = entrants ? current.reduce((s, r) => s + (r.projectedRate ?? 0) * r.entrants, 0) / entrants : null;
    return {
      id: b.id,
      name: b.name,
      liveLoans: live.filter((l) => l.branchId === b.id).length,
      trailing,
      projected,
      projectedEntrants: entrants,
      months: rows.map((r) => ({ period: r.period, rate: r.rate ?? r.projectedRate, matured: r.matured, entrants: r.entrants })),
    };
  });

  const trailingAll = from && to ? trailingRollRate(snaps, from, to) : null;
  const openCohorts = monthlyAll.filter((r) => !r.matured);
  const openEntrants = openCohorts.reduce((s, r) => s + r.entrants, 0);
  const projectedAll = openEntrants ? openCohorts.reduce((s, r) => s + (r.projectedRate ?? 0) * r.entrants, 0) / openEntrants : null;

  // Promises
  const scopeLoans = branchId ? sql`${promises.loanId} in (select id from loans where branch_id = ${branchId})` : undefined;
  const since7 = addDays(today, -7);
  const recentPromises = await db
    .select({ status: promises.status, promisedDate: promises.promisedDate })
    .from(promises)
    .where(and(gte(promises.promisedDate, since7), lt(promises.promisedDate, today), scopeLoans));
  const kept7 = recentPromises.filter((p) => p.status === "kept").length;
  const broken7 = recentPromises.filter((p) => p.status === "broken").length;
  const brokenList = await db
    .select({
      id: promises.id,
      loanId: promises.loanId,
      promisedDate: promises.promisedDate,
      amount: promises.amount,
      borrower: loans.borrowerName,
      officer: users.name,
      officerId: users.id,
      dpd: loans.dpd,
    })
    .from(promises)
    .innerJoin(loans, eq(loans.id, promises.loanId))
    .innerJoin(users, eq(users.id, promises.officerId))
    .where(and(eq(promises.status, "broken"), gte(promises.promisedDate, addDays(today, -7)), eq(loans.status, "overdue"), branchId ? eq(loans.branchId, branchId) : undefined))
    .orderBy(desc(promises.promisedDate))
    .limit(8);
  const dueToday = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(promises)
    .where(and(eq(promises.status, "open"), eq(promises.promisedDate, today), scopeLoans));

  // Logging discipline: share of the last 7 days' visits captured the same day they happened.
  const since7Ts = istInstant(since7, 0);
  const visits7 = await db
    .select({ occurredAt: outcomes.occurredAt, capturedAt: outcomes.capturedAt, flags: outcomes.flags })
    .from(outcomes)
    .innerJoin(users, eq(users.id, outcomes.officerId))
    .where(and(gte(outcomes.occurredAt, since7Ts), branchId ? eq(users.branchId, branchId) : undefined));
  const sameDay = visits7.filter((v) => istDate(v.occurredAt) === istDate(v.capturedAt)).length;

  const blocked30 = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contactAttempts)
    .innerJoin(users, eq(users.id, contactAttempts.officerId))
    .where(and(eq(contactAttempts.allowed, false), gte(contactAttempts.at, istInstant(addDays(today, -30), 0)), branchId ? eq(users.branchId, branchId) : undefined));

  const team = await teamActivity(db, branchId, today);

  return {
    today,
    fileDate,
    stale: fileDate !== today,
    target: ROLL_TARGET,
    baseline: ROLL_BASELINE,
    rollRate: trailingAll,
    projected: projectedAll,
    projectedEntrants: openEntrants,
    weekly: weeklyAll.map((r) => ({ period: r.period, rate: r.rate ?? r.projectedRate, matured: r.matured, entrants: r.entrants })),
    byBranch,
    promises: { kept7, broken7, dueToday: dueToday[0]?.n ?? 0, brokenList },
    logging: { visits7: visits7.length, sameDay, sameDayRate: visits7.length ? sameDay / visits7.length : null },
    blockedAttempts30: blocked30[0]?.n ?? 0,
    team,
    liveLoans: live.length,
  };
}

export async function teamActivity(db: DB, branchId: string | null, today: string) {
  const officers = await db
    .select()
    .from(users)
    .where(and(eq(users.role, "officer"), branchId ? eq(users.branchId, branchId) : undefined))
    .orderBy(asc(users.name));
  if (!officers.length) return [];
  const ids = officers.map((o) => o.id);
  const start = istInstant(today, 0);
  const load = await db
    .select({ id: loans.assignedOfficerId, n: sql<number>`count(*)::int`, top: sql<number>`count(*) filter (where ${loans.score} >= 60)::int` })
    .from(loans)
    .where(and(eq(loans.status, "overdue"), inArray(loans.assignedOfficerId, ids)))
    .groupBy(loans.assignedOfficerId);
  const todays = await db
    .select({ officerId: outcomes.officerId, loanId: outcomes.loanId, type: outcomes.type, flags: outcomes.flags })
    .from(outcomes)
    .where(and(inArray(outcomes.officerId, ids), gte(outcomes.occurredAt, start)));
  const blocked = await db
    .select({ officerId: contactAttempts.officerId, n: sql<number>`count(*)::int` })
    .from(contactAttempts)
    .where(and(inArray(contactAttempts.officerId, ids), eq(contactAttempts.allowed, false), gte(contactAttempts.at, start)))
    .groupBy(contactAttempts.officerId);

  return officers.map((o) => {
    const mine = todays.filter((t) => t.officerId === o.id);
    const l = load.find((x) => x.id === o.id);
    return {
      id: o.id,
      name: o.name,
      branchId: o.branchId,
      pincodes: o.pincodes,
      maxLoad: o.maxLoad,
      assigned: l?.n ?? 0,
      highPriority: l?.top ?? 0,
      visitedToday: new Set(mine.map((m) => m.loanId)).size,
      promisesToday: mine.filter((m) => m.type === "promise").length,
      paidToday: mine.filter((m) => m.type === "paid").length,
      flagsToday: mine.filter((m) => m.flags.includes("far_from_borrower")).length,
      blockedToday: blocked.find((b) => b.officerId === o.id)?.n ?? 0,
      lastSyncAt: o.lastSyncAt?.toISOString() ?? null,
    };
  });
}

export async function officerDetail(db: DB, officerId: string, date: string) {
  const [officer] = await db.select().from(users).where(and(eq(users.id, officerId), eq(users.role, "officer")));
  if (!officer) return null;
  const list = await db
    .select({
      id: loans.id,
      borrowerName: loans.borrowerName,
      businessType: loans.businessType,
      pincode: loans.pincode,
      dpd: loans.dpd,
      overdueAmount: loans.overdueAmount,
      outstanding: loans.outstanding,
      score: loans.score,
      confidence: loans.confidence,
      reasons: loans.reasons,
      managerRank: loans.managerRank,
      assignmentNote: loans.assignmentNote,
    })
    .from(loans)
    .where(and(eq(loans.assignedOfficerId, officerId), eq(loans.status, "overdue")))
    .orderBy(sql`${loans.managerRank} asc nulls last`, desc(loans.score));
  const start = istInstant(date, 0);
  const end = istInstant(addDays(date, 1), 0);
  const visits = await db
    .select({ o: outcomes, borrower: loans.borrowerName, loanLat: loans.lat, loanLng: loans.lng })
    .from(outcomes)
    .innerJoin(loans, eq(loans.id, outcomes.loanId))
    .where(and(eq(outcomes.officerId, officerId), gte(outcomes.occurredAt, start), lt(outcomes.occurredAt, end)))
    .orderBy(asc(outcomes.occurredAt));
  const attempts = await db
    .select({ a: contactAttempts, borrower: loans.borrowerName })
    .from(contactAttempts)
    .innerJoin(loans, eq(loans.id, contactAttempts.loanId))
    .where(and(eq(contactAttempts.officerId, officerId), gte(contactAttempts.at, start), lt(contactAttempts.at, end), eq(contactAttempts.allowed, false)))
    .orderBy(asc(contactAttempts.at));
  const colleagues = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.role, "officer"), eq(users.branchId, officer.branchId!), eq(users.active, true)))
    .orderBy(asc(users.name));
  return {
    officer: { id: officer.id, name: officer.name, branchId: officer.branchId, pincodes: officer.pincodes, maxLoad: officer.maxLoad, lastSyncAt: officer.lastSyncAt?.toISOString() ?? null },
    list,
    visits: visits.map(({ o, borrower, loanLat, loanLng }) => ({
      id: o.id,
      loanId: o.loanId,
      borrower,
      type: o.type,
      amount: o.amount,
      occurredAt: o.occurredAt.toISOString(),
      receivedAt: o.receivedAt.toISOString(),
      lat: o.lat,
      lng: o.lng,
      loanLat,
      loanLng,
      distanceM: o.distanceM,
      gpsStatus: o.gpsStatus,
      flags: o.flags,
      note: o.note,
    })),
    blocked: attempts.map(({ a, borrower }) => ({ id: a.id, loanId: a.loanId, borrower, channel: a.channel, at: a.at.toISOString(), reason: a.blockReason })),
    colleagues,
  };
}

export async function promiseBoard(db: DB, branchId: string | null, today: string) {
  const rows = await db
    .select({
      id: promises.id,
      loanId: promises.loanId,
      promisedDate: promises.promisedDate,
      amount: promises.amount,
      status: promises.status,
      createdAt: promises.createdAt,
      borrower: loans.borrowerName,
      officer: users.name,
      dpd: loans.dpd,
    })
    .from(promises)
    .innerJoin(loans, eq(loans.id, promises.loanId))
    .innerJoin(users, eq(users.id, promises.officerId))
    .where(and(gte(promises.promisedDate, addDays(today, -14)), branchId ? eq(loans.branchId, branchId) : undefined, sql`${promises.status} <> 'superseded'`))
    .orderBy(asc(promises.promisedDate));
  const ids = rows.map((r) => r.id);
  const msgs = ids.length
    ? await db
        .select({ promiseId: messages.promiseId, templateId: messages.templateId, status: messages.status, at: messages.sentAt, scheduledFor: messages.scheduledFor })
        .from(messages)
        .where(and(inArray(messages.promiseId, ids), eq(messages.recipient, "borrower")))
    : [];
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    reminders: msgs
      .filter((m) => m.promiseId === r.id)
      .map((m) => ({ templateId: m.templateId, status: m.status, at: (m.at ?? m.scheduledFor)?.toISOString() ?? null })),
  }));
}

/**
 * Weekly back-test: for each week, the score each loan had that day versus whether it then
 * rolled into the next bucket. Weeks after the training cut-off are genuinely out-of-sample.
 */
export async function modelReport(db: DB) {
  const versions = await db.select().from(modelVersions).orderBy(desc(modelVersions.trainedAt)).limit(5);
  const rows = await db
    .select({ asOfDate: snapshots.asOfDate, loanId: snapshots.loanId, branchId: snapshots.branchId, dpd: snapshots.dpd, p: snapshots.riskProbability })
    .from(snapshots);
  if (!rows.length) return { versions, weeks: [], overall: null, dataTo: null };
  const dataTo = rows.reduce((m, r) => (r.asOfDate > m ? r.asOfDate : m), rows[0].asOfDate);
  const dataFrom = rows.reduce((m, r) => (r.asOfDate < m ? r.asOfDate : m), rows[0].asOfDate);
  const maxDpd = new Map(episodes(rows).map((e) => [`${e.loanId}|${e.entryDate}`, e.maxDpd]));
  const active = versions.find((v) => v.active);
  const cutoff = active?.params.trainedOn?.to ?? null;

  const weeks: { week: string; n: number; rolled: number; auc: number | null; topCapture: number | null; outOfSample: boolean }[] = [];
  const oosPreds: number[] = [];
  const oosLabels: (0 | 1)[] = [];
  for (let d = dataFrom; d <= dataTo; d = addDays(d, 7)) {
    const day = rows.filter((r) => r.asOfDate === d && r.dpd <= 90 && r.p !== null && addDays(d, nextBucket(r.dpd) - r.dpd) <= dataTo);
    if (day.length < 20) continue;
    const labels = day.map((r) => ((maxDpd.get(`${r.loanId}|${addDays(d, -(r.dpd - 1))}`) ?? 0) >= nextBucket(r.dpd) ? 1 : 0) as 0 | 1);
    const preds = day.map((r) => r.p!);
    const rolled = labels.reduce<number>((a, b) => a + b, 0);
    // "If officers had worked the top 30% of scores first, what share of the loans that rolled would they have reached?"
    const order = preds.map((p, i) => [p, labels[i]] as const).sort((a, b) => b[0] - a[0]);
    const top = order.slice(0, Math.ceil(order.length * 0.3)).filter(([, y]) => y === 1).length;
    const outOfSample = cutoff ? d > cutoff : true;
    if (outOfSample) {
      oosPreds.push(...preds);
      oosLabels.push(...labels);
    }
    weeks.push({ week: d, n: day.length, rolled, auc: auc(preds, labels), topCapture: rolled ? top / rolled : null, outOfSample });
  }
  return { versions, weeks, overall: oosPreds.length ? evaluate(oosPreds, oosLabels) : null, dataTo, cutoff };
}

export async function importHistory(db: DB, limit = 10) {
  return db.select().from(imports).orderBy(desc(imports.asOfDate), desc(imports.createdAt)).limit(limit);
}

export { daysBetween };
