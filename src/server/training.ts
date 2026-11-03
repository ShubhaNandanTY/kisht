import { buildFeatures, nextBucket } from "@/domain/scoring/features";
import { evaluate, predict, train, type Example, type ModelMetrics, type ModelParams } from "@/domain/scoring/model";
import { episodes } from "@/domain/rollRate";
import { addDays, daysBetween } from "@/domain/time";
import { factsFor, groupBy, type OutcomeRec, type PromiseRec } from "./facts";

export type HistSnap = {
  asOfDate: string;
  loanId: string;
  branchId: string;
  dpd: number;
  outstanding: number;
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;
};
export type LoanStatic = { id: string; missedEmis12m: number; monthsOnBook: number; lastImportDate: string | null };

export type LabelledExample = Example & { loanId: string; asOfDate: string };

/**
 * Replays history into training rows. For a loan seen at d DPD on day D, the label is 1 if that
 * delinquency went on to reach the next bucket (31, 61 or 91 DPD) before being paid. Rows are only
 * used once the answer is known (D + days-to-roll is inside the data), and sampled weekly so one
 * long delinquency does not dominate.
 */
export function buildExamples(
  snaps: HistSnap[],
  loans: LoanStatic[],
  promises: PromiseRec[],
  outcomes: OutcomeRec[],
  opts: { from: string; to: string; dataTo: string; stepDays?: number },
): LabelledExample[] {
  const step = opts.stepDays ?? 7;
  const loanById = new Map(loans.map((l) => [l.id, l]));
  const promisesByLoan = groupBy(promises, (p) => p.loanId);
  const outcomesByLoan = groupBy(outcomes, (o) => o.loanId);
  const maxDpd = new Map<string, number>();
  for (const e of episodes(snaps)) maxDpd.set(`${e.loanId}|${e.entryDate}`, e.maxDpd);

  const out: LabelledExample[] = [];
  for (const s of snaps) {
    if (s.asOfDate < opts.from || s.asOfDate > opts.to) continue;
    if (s.dpd > 90) continue;
    if (daysBetween(opts.from, s.asOfDate) % step !== 0) continue;
    const next = nextBucket(s.dpd);
    if (addDays(s.asOfDate, next - s.dpd) > opts.dataTo) continue; // outcome not known yet
    const loan = loanById.get(s.loanId);
    if (!loan) continue;
    const entry = addDays(s.asOfDate, -(s.dpd - 1));
    const y = (maxDpd.get(`${s.loanId}|${entry}`) ?? 0) >= next ? 1 : 0;
    const monthsAgo = loan.lastImportDate ? Math.floor(daysBetween(s.asOfDate, loan.lastImportDate) / 30) : 0;
    const facts = factsFor(
      { ...s, missedEmis12m: loan.missedEmis12m, monthsOnBook: Math.max(loan.monthsOnBook - monthsAgo, 0) },
      s.asOfDate,
      promisesByLoan.get(s.loanId),
      outcomesByLoan.get(s.loanId),
    );
    out.push({ loanId: s.loanId, asOfDate: s.asOfDate, x: buildFeatures(facts), y });
  }
  return out;
}

/**
 * Out-of-time validation: fit on older history, measure on the most recent 30 days whose
 * outcomes are known. This is the weekly back-test number managers see.
 */
export function trainWithBacktest(
  snaps: HistSnap[],
  loans: LoanStatic[],
  promises: PromiseRec[],
  outcomes: OutcomeRec[],
  dataFrom: string,
  dataTo: string,
): { params: ModelParams; metrics: ModelMetrics } {
  const holdoutTo = addDays(dataTo, -1);
  const holdoutFrom = addDays(dataTo, -45);
  const trainSet = buildExamples(snaps, loans, promises, outcomes, { from: dataFrom, to: addDays(holdoutFrom, -1), dataTo: addDays(holdoutFrom, -1), stepDays: 3 });
  const holdout = buildExamples(snaps, loans, promises, outcomes, { from: holdoutFrom, to: holdoutTo, dataTo, stepDays: 3 });
  const params = train(trainSet);
  params.trainedOn = {
    from: dataFrom,
    to: addDays(holdoutFrom, -1),
    n: trainSet.length,
    positives: trainSet.filter((e) => e.y === 1).length,
  };
  const metrics = evaluate(
    holdout.map((e) => predict(params, e.x).p),
    holdout.map((e) => e.y),
    { from: holdoutFrom, to: holdoutTo },
  );
  return { params, metrics };
}
