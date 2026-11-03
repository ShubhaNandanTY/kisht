import { addDays, daysBetween } from "../time";

export const FEATURES = [
  "dpd",
  "daysToNextBucket",
  "daysSinceLastPayment",
  "missedEmis12m",
  "brokenPromises90d",
  "keptPromises90d",
  "notReachable14d",
  "openDispute",
  "hasActivePromise",
  "logOutstanding",
  "monthsOnBook",
] as const;

export type FeatureName = (typeof FEATURES)[number];
export type FeatureVector = Record<FeatureName, number>;

export type LoanFacts = {
  asOfDate: string;
  dpd: number;
  outstanding: number;
  missedEmis12m: number;
  monthsOnBook: number;
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;
  // resolvedOn: the date the promise became kept, broken or superseded (null while open).
  // Features only use what was known on asOfDate, so history can be replayed without leakage.
  promises: { promisedDate: string; status: string; createdOn: string; resolvedOn: string | null }[];
  outcomes: { type: string; on: string }[];
};

export const NO_PAYMENT_DAYS = 180;

/** Days until the loan crosses into the next 30-day bucket (31, 61, 91 DPD) if nothing is paid. */
export function daysToNextBucket(dpd: number): number {
  return nextBucket(dpd) - dpd;
}

export function nextBucket(dpd: number): number {
  return Math.ceil(Math.max(dpd, 1) / 30) * 30 + 1;
}

/** Turns what we know about a loan on a given day into model inputs. Uses only facts dated on or before asOfDate. */
export function buildFeatures(f: LoanFacts): FeatureVector {
  const d90 = addDays(f.asOfDate, -90);
  const d14 = addDays(f.asOfDate, -14);
  const past = (on: string) => on <= f.asOfDate;
  const promises = f.promises.filter((p) => past(p.createdOn));
  const outcomes = f.outcomes.filter((o) => past(o.on));
  const known = (p: LoanFacts["promises"][number]) => p.resolvedOn !== null && p.resolvedOn <= f.asOfDate;

  // A dispute stays open until a later outcome of any other type is logged.
  const lastDispute = outcomes.filter((o) => o.type === "dispute").map((o) => o.on).sort().pop();
  const openDispute = lastDispute && !outcomes.some((o) => o.type !== "dispute" && o.on > lastDispute) ? 1 : 0;

  return {
    dpd: f.dpd,
    daysToNextBucket: daysToNextBucket(f.dpd),
    daysSinceLastPayment: f.lastPaymentDate
      ? Math.min(Math.max(daysBetween(f.lastPaymentDate, f.asOfDate), 0), NO_PAYMENT_DAYS)
      : NO_PAYMENT_DAYS,
    missedEmis12m: f.missedEmis12m,
    brokenPromises90d: promises.filter((p) => p.status === "broken" && known(p) && p.promisedDate >= d90).length,
    keptPromises90d: promises.filter((p) => p.status === "kept" && known(p) && p.promisedDate >= d90).length,
    notReachable14d: outcomes.filter((o) => o.type === "not_reachable" && o.on >= d14).length,
    openDispute,
    hasActivePromise: promises.some((p) => !known(p) && p.promisedDate >= addDays(f.asOfDate, -1)) ? 1 : 0,
    logOutstanding: Math.log(Math.max(f.outstanding, 10_000) / 100_000),
    monthsOnBook: Math.min(f.monthsOnBook, 60),
  };
}
