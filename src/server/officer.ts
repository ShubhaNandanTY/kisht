import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { branches, contactAttempts, loans, outcomes, promises, users, type Reason } from "@/db/schema";
import { addDays, istDate, istInstant } from "@/domain/time";
import { BRANCHES } from "./demo/reference";
import { latestImportDate } from "./imports";

export type OfficerLoan = {
  id: string;
  borrowerName: string;
  businessType: string;
  phone: string;
  address: string;
  lat: number | null;
  lng: number | null;
  language: "hi" | "en";
  dpd: number;
  overdueAmount: number;
  outstanding: number;
  emiAmount: number;
  missedEmis12m: number;
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;
  score: number;
  probability: number;
  confidence: "high" | "medium" | "low";
  reasons: Reason[];
  managerRank: number | null;
  promise: { id: string; promisedDate: string; amount: number; status: string } | null;
  history: { id: string; type: string; amount: number | null; occurredAt: string; distanceM: number | null; gpsStatus: string }[];
  visitedToday: boolean;
};

export type OfficerPayload = {
  serverTime: string;
  today: string;
  fileDate: string | null;
  officer: { id: string; name: string; branchId: string; branchName: string; branchNameHi: string; branchPhone: string };
  loans: OfficerLoan[];
  promises: { loanId: string; borrowerName: string; promisedDate: string; amount: number; status: string }[];
  log: { id: string; kind: "outcome" | "blocked"; loanId: string; borrowerName: string; type: string; at: string; amount: number | null }[];
};

/** Everything the officer's phone needs for the day, in one response it can cache for offline use. */
export async function officerDay(db: DB, officerId: string, now: Date): Promise<OfficerPayload> {
  const today = istDate(now);
  const [me] = await db.select().from(users).where(eq(users.id, officerId));
  const [branch] = await db.select().from(branches).where(eq(branches.id, me.branchId!));
  const fileDate = await latestImportDate(db);

  const list = await db
    .select()
    .from(loans)
    .where(and(eq(loans.assignedOfficerId, officerId), eq(loans.status, "overdue")))
    .orderBy(sql`${loans.managerRank} asc nulls last`, desc(loans.score));
  const ids = list.map((l) => l.id);

  const ps = ids.length ? await db.select().from(promises).where(inArray(promises.loanId, ids)).orderBy(desc(promises.createdAt)) : [];
  const os = ids.length
    ? await db
        .select()
        .from(outcomes)
        .where(and(inArray(outcomes.loanId, ids), gte(outcomes.occurredAt, istInstant(addDays(today, -60), 0))))
        .orderBy(desc(outcomes.occurredAt))
    : [];

  const todayStart = istInstant(today, 0);
  const loansOut: OfficerLoan[] = list.map((l) => {
    const mine = ps.filter((p) => p.loanId === l.id);
    // Show the open promise if there is one, else the latest outcome of a recent promise.
    const promise = mine.find((p) => p.status === "open") ?? mine.find((p) => p.status !== "superseded" && p.promisedDate >= addDays(today, -14)) ?? null;
    const hist = os.filter((o) => o.loanId === l.id);
    return {
      id: l.id,
      borrowerName: l.borrowerName,
      businessType: l.businessType,
      phone: l.phone,
      address: l.address,
      lat: l.lat,
      lng: l.lng,
      language: l.language,
      dpd: l.dpd,
      overdueAmount: l.overdueAmount,
      outstanding: l.outstanding,
      emiAmount: l.emiAmount,
      missedEmis12m: l.missedEmis12m,
      lastPaymentDate: l.lastPaymentDate,
      lastPaymentAmount: l.lastPaymentAmount,
      score: l.score ?? 0,
      probability: l.riskProbability ?? 0,
      confidence: l.confidence ?? "low",
      reasons: l.reasons ?? [],
      managerRank: l.managerRank,
      promise: promise ? { id: promise.id, promisedDate: promise.promisedDate, amount: promise.amount, status: promise.status } : null,
      history: hist.slice(0, 5).map((o) => ({ id: o.id, type: o.type, amount: o.amount, occurredAt: o.occurredAt.toISOString(), distanceM: o.distanceM, gpsStatus: o.gpsStatus })),
      visitedToday: hist.some((o) => o.occurredAt >= todayStart),
    };
  });

  const byId = new Map(list.map((l) => [l.id, l]));
  const promiseList = ps
    .filter((p) => (p.status === "open" || (p.status === "broken" && p.promisedDate >= addDays(today, -14))) && byId.has(p.loanId))
    .filter((p, i, arr) => arr.findIndex((q) => q.loanId === p.loanId && q.status === p.status) === i)
    .map((p) => ({ loanId: p.loanId, borrowerName: byId.get(p.loanId)!.borrowerName, promisedDate: p.promisedDate, amount: p.amount, status: p.status }))
    .sort((a, b) => a.promisedDate.localeCompare(b.promisedDate));

  const todays = await db
    .select({ o: outcomes, name: loans.borrowerName })
    .from(outcomes)
    .innerJoin(loans, eq(loans.id, outcomes.loanId))
    .where(and(eq(outcomes.officerId, officerId), gte(outcomes.occurredAt, todayStart)));
  const blocked = await db
    .select({ a: contactAttempts, name: loans.borrowerName })
    .from(contactAttempts)
    .innerJoin(loans, eq(loans.id, contactAttempts.loanId))
    .where(and(eq(contactAttempts.officerId, officerId), eq(contactAttempts.allowed, false), gte(contactAttempts.at, todayStart)));
  const log = [
    ...todays.map(({ o, name }) => ({ id: o.id, kind: "outcome" as const, loanId: o.loanId, borrowerName: name, type: o.type, at: o.occurredAt.toISOString(), amount: o.amount })),
    ...blocked.map(({ a, name }) => ({ id: a.id, kind: "blocked" as const, loanId: a.loanId, borrowerName: name, type: a.channel, at: a.at.toISOString(), amount: null })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return {
    serverTime: now.toISOString(),
    today,
    fileDate,
    officer: {
      id: me.id,
      name: me.name,
      branchId: branch.id,
      branchName: branch.name,
      branchNameHi: branch.nameHi,
      branchPhone: BRANCHES.find((b) => b.id === branch.id)?.phone ?? "",
    },
    loans: loansOut,
    promises: promiseList,
    log,
  };
}
