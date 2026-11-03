import type { LoanFacts } from "@/domain/scoring/features";
import { istDate } from "@/domain/time";

export type PromiseRec = { loanId: string; promisedDate: string; status: string; createdAt: Date; resolvedAt: Date | null };
export type OutcomeRec = { loanId: string; type: string; occurredAt: Date };

export function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/** Assembles the facts the scoring model needs for one loan on one day. */
export function factsFor(
  loan: { dpd: number; outstanding: number; missedEmis12m: number; monthsOnBook: number; lastPaymentDate: string | null; lastPaymentAmount: number | null },
  asOfDate: string,
  promises: PromiseRec[] = [],
  outcomes: OutcomeRec[] = [],
): LoanFacts {
  return {
    asOfDate,
    dpd: loan.dpd,
    outstanding: loan.outstanding,
    missedEmis12m: loan.missedEmis12m,
    monthsOnBook: loan.monthsOnBook,
    lastPaymentDate: loan.lastPaymentDate,
    lastPaymentAmount: loan.lastPaymentAmount,
    promises: promises.map((p) => ({
      promisedDate: p.promisedDate,
      status: p.status,
      createdOn: istDate(p.createdAt),
      resolvedOn: p.resolvedAt ? istDate(p.resolvedAt) : null,
    })),
    outcomes: outcomes.map((o) => ({ type: o.type, on: istDate(o.occurredAt) })),
  };
}
