import { addDays, daysBetween } from "./time";

export type Snap = { asOfDate: string; loanId: string; branchId: string; dpd: number };

export type Episode = {
  loanId: string;
  branchId: string;
  entryDate: string; // first day past due
  maxDpd: number;
  lastSeen: string;
};

/**
 * Groups daily snapshots into delinquency episodes. A loan's entry date is
 * asOfDate - (dpd - 1), which is the same on every day of one episode, so the episode
 * key survives gaps in the files (holidays, a missed import).
 */
export function episodes(snaps: Snap[]): Episode[] {
  const map = new Map<string, Episode>();
  for (const s of snaps) {
    const entryDate = addDays(s.asOfDate, -(s.dpd - 1));
    const key = `${s.loanId}|${entryDate}`;
    const e = map.get(key);
    if (!e) map.set(key, { loanId: s.loanId, branchId: s.branchId, entryDate, maxDpd: s.dpd, lastSeen: s.asOfDate });
    else {
      e.maxDpd = Math.max(e.maxDpd, s.dpd);
      if (s.asOfDate > e.lastSeen) e.lastSeen = s.asOfDate;
    }
  }
  return [...map.values()];
}

export type CohortRow = {
  period: string; // "2026-10" for month, or the Monday "2026-10-06" for week
  branchId: string | "ALL";
  entrants: number;
  rolled: number;
  open: number; // still 1-30 DPD and not yet able to roll or cure
  rate: number | null; // rolled / entrants, only when matured
  matured: boolean;
  projectedRate: number | null; // for open cohorts: (rolled + sum of model risk of open loans) / entrants
};

function periodOf(date: string, period: "month" | "week"): string {
  if (period === "month") return date.slice(0, 7);
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

/**
 * 1-30 to 31-60 roll rate by entry cohort: of the loans that fell 1 day past due in a period,
 * the share that reached 31 DPD. This is how the brief states it (450 fall due a month, 22% roll).
 * A cohort is matured once its last entrant has had 30 days to roll. Until then the rate is
 * projected with the scoring model, which is how managers see this week instead of last month.
 */
export function rollRates(
  snaps: Snap[],
  opts: { period: "month" | "week"; byBranch: boolean; dataFrom: string; dataTo: string; riskByLoan?: Map<string, number> },
): CohortRow[] {
  const groups = new Map<string, { period: string; branchId: string; eps: Episode[] }>();
  for (const e of episodes(snaps)) {
    if (e.entryDate < opts.dataFrom) continue; // entered before our data starts: cohort not fully seen
    const period = periodOf(e.entryDate, opts.period);
    const branchId = opts.byBranch ? e.branchId : "ALL";
    const key = `${period}|${branchId}`;
    if (!groups.has(key)) groups.set(key, { period, branchId, eps: [] });
    groups.get(key)!.eps.push(e);
  }

  const rows: CohortRow[] = [];
  for (const g of groups.values()) {
    let rolled = 0;
    let open = 0;
    let projected = 0;
    let latestEntry = g.eps[0].entryDate;
    for (const e of g.eps) {
      if (e.entryDate > latestEntry) latestEntry = e.entryDate;
      if (e.maxDpd >= 31) rolled++;
      else if (e.lastSeen === opts.dataTo && daysBetween(e.entryDate, opts.dataTo) < 30) {
        open++;
        projected += opts.riskByLoan?.get(e.loanId) ?? 0.22;
      }
      // otherwise the loan left the overdue list before 31 DPD: cured
    }
    const periodEnd = opts.period === "month" ? lastDayOfMonth(g.period) : addDays(g.period, 6);
    const matured = daysBetween(periodEnd, opts.dataTo) >= 30 && open === 0;
    const n = g.eps.length;
    rows.push({
      period: g.period,
      branchId: g.branchId,
      entrants: n,
      rolled,
      open,
      matured,
      rate: matured ? rolled / n : null,
      projectedRate: matured ? null : (rolled + projected) / n,
    });
  }
  return rows.sort((a, b) => a.period.localeCompare(b.period) || a.branchId.localeCompare(b.branchId));
}

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Trailing 30-day roll rate measured on the most recent fully matured window of entrants. */
export function trailingRollRate(snaps: Snap[], dataFrom: string, dataTo: string, branchId?: string) {
  const windowEnd = addDays(dataTo, -30);
  const windowStart = addDays(windowEnd, -29);
  let n = 0;
  let rolled = 0;
  for (const e of episodes(snaps)) {
    if (branchId && e.branchId !== branchId) continue;
    if (e.entryDate < windowStart || e.entryDate > windowEnd || e.entryDate < dataFrom) continue;
    n++;
    if (e.maxDpd >= 31) rolled++;
  }
  return { entrants: n, rolled, rate: n ? rolled / n : null, windowStart, windowEnd };
}
