import { describe, expect, it } from "vitest";
import { episodes, rollRates, trailingRollRate, type Snap } from "@/domain/rollRate";
import { addDays } from "@/domain/time";

// Build daily snapshots for a loan that falls due on `entry` and is seen for `days` days.
function track(loanId: string, entry: string, days: number, branchId = "SYG"): Snap[] {
  return Array.from({ length: days }, (_, i) => ({ asOfDate: addDays(entry, i), loanId, branchId, dpd: i + 1 }));
}

describe("roll rate", () => {
  const from = "2026-08-01";
  const to = "2026-11-03";

  it("groups daily snapshots into one episode per delinquency, even with gaps", () => {
    const snaps = track("A", "2026-09-01", 40).filter((_, i) => i % 3 !== 1);
    expect(episodes(snaps)).toHaveLength(1);
    expect(episodes(snaps)[0]).toMatchObject({ entryDate: "2026-09-01", maxDpd: 40 });
  });

  it("counts entrants that reached 31 DPD over all entrants in the month", () => {
    const snaps = [
      ...track("A", "2026-09-03", 45), // rolled
      ...track("B", "2026-09-10", 12), // cured at 12 DPD
      ...track("C", "2026-09-20", 31), // rolled on its last day
      ...track("D", "2026-09-25", 30), // cured at 30 DPD
      ...track("E", "2026-09-28", 31, "PTM"), // rolled, other branch
    ];
    const rows = rollRates(snaps, { period: "month", byBranch: false, dataFrom: from, dataTo: to });
    expect(rows).toEqual([
      expect.objectContaining({ period: "2026-09", entrants: 5, rolled: 3, rate: 0.6, matured: true }),
    ]);
    const byBranch = rollRates(snaps, { period: "month", byBranch: true, dataFrom: from, dataTo: to });
    expect(byBranch.map((r) => [r.branchId, r.rate])).toEqual([
      ["PTM", 1],
      ["SYG", 0.5],
    ]);
  });

  it("projects open cohorts with model risk instead of waiting a month", () => {
    const snaps = [...track("A", "2026-10-25", 10), ...track("B", "2026-10-20", 5)]; // A still open, B cured
    const risk = new Map([["A", 0.4]]);
    const [row] = rollRates(snaps, { period: "month", byBranch: false, dataFrom: from, dataTo: to, riskByLoan: risk });
    expect(row).toMatchObject({ matured: false, rate: null, open: 1, entrants: 2 });
    expect(row.projectedRate).toBeCloseTo(0.2);
  });

  it("ignores loans that entered before the data starts", () => {
    const snaps = track("A", "2026-07-20", 60);
    expect(rollRates(snaps, { period: "month", byBranch: false, dataFrom: from, dataTo: to })).toEqual([]);
  });

  it("computes a trailing 30-day matured rate", () => {
    const snaps = [...track("A", "2026-09-10", 35), ...track("B", "2026-09-15", 5), ...track("C", "2026-10-30", 5)];
    const r = trailingRollRate(snaps, from, to);
    expect(r).toMatchObject({ entrants: 2, rolled: 1, rate: 0.5 });
  });
});
