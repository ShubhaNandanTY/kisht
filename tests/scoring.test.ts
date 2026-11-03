import { describe, expect, it } from "vitest";
import { buildFeatures, daysToNextBucket, type LoanFacts } from "@/domain/scoring/features";
import { auc, evaluate, predict, RULES_V0, train, type Example } from "@/domain/scoring/model";
import { scoreLoan } from "@/domain/scoring/score";

const base: LoanFacts = {
  asOfDate: "2026-11-03",
  dpd: 12,
  outstanding: 640000,
  missedEmis12m: 1,
  monthsOnBook: 26,
  lastPaymentDate: "2026-09-22",
  lastPaymentAmount: 29000,
  promises: [],
  outcomes: [{ type: "promise", on: "2026-10-30" }],
};

describe("features", () => {
  it("counts days to the next bucket", () => {
    expect(daysToNextBucket(27)).toBe(4);
    expect(daysToNextBucket(30)).toBe(1);
    expect(daysToNextBucket(31)).toBe(30);
    expect(daysToNextBucket(1)).toBe(30);
  });

  it("only uses promise outcomes that were known on the scoring date (no leakage)", () => {
    const facts: LoanFacts = {
      ...base,
      promises: [
        { promisedDate: "2026-10-31", status: "broken", createdOn: "2026-10-27", resolvedOn: "2026-11-02" },
        { promisedDate: "2026-11-05", status: "broken", createdOn: "2026-11-01", resolvedOn: "2026-11-07" },
      ],
    };
    const x = buildFeatures(facts);
    expect(x.brokenPromises90d).toBe(1);
    expect(x.hasActivePromise).toBe(1); // the second one was still open on 3 Nov
  });

  it("treats a dispute as open until something else is logged", () => {
    const open = buildFeatures({ ...base, outcomes: [{ type: "dispute", on: "2026-11-01" }] });
    const closed = buildFeatures({ ...base, outcomes: [{ type: "dispute", on: "2026-11-01" }, { type: "promise", on: "2026-11-02" }] });
    expect(open.openDispute).toBe(1);
    expect(closed.openDispute).toBe(0);
  });
});

function synthetic(n: number, seed = 7): Example[] {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => {
    const dpd = 1 + Math.floor(rand() * 29);
    const broken = rand() < 0.25 ? 1 + Math.floor(rand() * 2) : 0;
    const x = buildFeatures({ ...base, dpd, promises: [], missedEmis12m: Math.floor(rand() * 4) });
    x.brokenPromises90d = broken;
    const truth = -1.5 + 0.08 * dpd + 0.9 * broken + 0.3 * x.missedEmis12m;
    return { x, y: (rand() < 1 / (1 + Math.exp(-truth)) ? 1 : 0) as 0 | 1 };
  });
}

describe("logistic model", () => {
  it("auc is 1 for a perfect ranking, 0.5 for ties, null without both classes", () => {
    expect(auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])).toBe(1);
    expect(auc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1])).toBe(0.5);
    expect(auc([0.1, 0.2], [1, 1])).toBeNull();
  });

  it("learns the direction of real signals and ranks better than chance on held-out data", () => {
    const params = train(synthetic(1500));
    const i = (f: string) => params.features.indexOf(f as never);
    expect(params.weights[i("brokenPromises90d")]).toBeGreaterThan(0);
    expect(params.weights[i("missedEmis12m")]).toBeGreaterThan(0);
    const test = synthetic(600, 99);
    const m = evaluate(test.map((e) => predict(params, e.x).p), test.map((e) => e.y));
    expect(m.auc!).toBeGreaterThan(0.7);
    expect(m.calibration.length).toBeGreaterThan(1);
  });

  it("refuses to train on too little history", () => {
    expect(() => train(synthetic(10))).toThrow("not_enough_history");
  });
});

describe("priority score and reasons", () => {
  it("gives a 0-100 score with at most three reasons, largest first", () => {
    const r = scoreLoan(RULES_V0, {
      ...base,
      dpd: 27,
      missedEmis12m: 4,
      promises: [{ promisedDate: "2026-10-31", status: "broken", createdOn: "2026-10-27", resolvedOn: "2026-11-02" }],
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.reasons.length).toBeLessThanOrEqual(3);
    const impacts = r.reasons.map((x) => x.impact);
    expect(impacts).toEqual([...impacts].sort((a, b) => b - a));
    expect(r.reasons.map((x) => x.key)).toContain("reason.broken_promises.up");
  });

  it("ranks a loan about to roll with a broken promise above a fresh one", () => {
    const risky = scoreLoan(RULES_V0, {
      ...base,
      dpd: 27,
      promises: [{ promisedDate: "2026-10-31", status: "broken", createdOn: "2026-10-27", resolvedOn: "2026-11-02" }],
    });
    const fresh = scoreLoan(RULES_V0, { ...base, dpd: 3, lastPaymentDate: "2026-10-20" });
    expect(risky.score).toBeGreaterThan(fresh.score);
  });

  it("is honest about confidence", () => {
    expect(scoreLoan(RULES_V0, base).confidence).toBe("low"); // untrained rules
    const trained = train(synthetic(800));
    expect(scoreLoan(trained, { ...base, monthsOnBook: 3 })).toMatchObject({ confidence: "low", confidenceReason: "confidence.new_loan" });
    expect(scoreLoan(trained, { ...base, outcomes: [] })).toMatchObject({ confidence: "medium" });
    expect(scoreLoan(trained, base).confidence).toBe("high");
  });
});
