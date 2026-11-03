import type { Confidence, Reason } from "@/db/schema";
import { buildFeatures, nextBucket, type FeatureName, type LoanFacts } from "./features";
import { predict, type ModelParams } from "./model";

export type ScoreResult = {
  score: number; // 0-100, the chance (in %) this loan rolls into the next DPD bucket before paying
  probability: number;
  confidence: Confidence;
  confidenceReason: string | null;
  reasons: Reason[];
};

const MIN_IMPACT = 1; // score points; smaller effects are noise, not reasons

/**
 * Scores one loan and explains the score.
 *
 * Each reason's impact is "how many points lower the score would be if this input were at the
 * portfolio average", computed exactly from the model (not a rule of thumb), so the three
 * reasons an officer sees are the three inputs that actually moved this loan up the list.
 */
export function scoreLoan(params: ModelParams, facts: LoanFacts): ScoreResult {
  const x = buildFeatures(facts);
  const { p, z, contributions } = predict(params, x);
  const logit = Math.log(p / (1 - p));
  const impacts = params.features.map((f, i) => ({
    feature: f,
    impact: 100 * (p - 1 / (1 + Math.exp(-(logit - contributions[i])))),
  }));

  // dpd and days-to-next-bucket describe the same fact for an officer; show them as one reason.
  const merged = new Map<FeatureName, number>();
  for (const { feature, impact } of impacts) {
    const key = feature === "dpd" ? "daysToNextBucket" : feature;
    merged.set(key, (merged.get(key) ?? 0) + impact);
  }
  const ranked = [...merged.entries()].map(([feature, impact]) => ({ feature, impact }));
  const up = ranked.filter((r) => r.impact >= MIN_IMPACT).sort((a, b) => b.impact - a.impact);
  const down = ranked.filter((r) => r.impact <= -MIN_IMPACT).sort((a, b) => a.impact - b.impact);
  const chosen = [...up.slice(0, 3), ...down.slice(0, Math.max(0, 3 - up.length))];

  const reasons: Reason[] = chosen.map(({ feature, impact }) => describe(feature, impact, facts, x));

  let confidence: Confidence = "high";
  let confidenceReason: string | null = null;
  const unusual = z.some((v) => Math.abs(v) > 4);
  if (params.kind === "rules") {
    confidence = "low";
    confidenceReason = "confidence.untrained";
  } else if (facts.monthsOnBook < 6) {
    confidence = "low";
    confidenceReason = "confidence.new_loan";
  } else if (unusual) {
    confidence = "low";
    confidenceReason = "confidence.unusual";
  } else if (!facts.outcomes.some((o) => o.on >= addDaysSimple(facts.asOfDate, -30))) {
    confidence = "medium";
    confidenceReason = "confidence.no_recent_contact";
  }

  return { score: Math.round(100 * p), probability: p, confidence, confidenceReason, reasons };
}

function addDaysSimple(date: string, n: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function describe(feature: FeatureName, impact: number, facts: LoanFacts, x: Record<FeatureName, number>): Reason {
  const dir = impact >= 0 ? "up" : "down";
  const r = (key: string, params: Reason["params"] = {}): Reason => ({ key: `reason.${key}.${dir}`, params, impact: Math.round(impact) });
  switch (feature) {
    case "daysToNextBucket":
      return r("roll", { days: x.daysToNextBucket, bucket: nextBucket(facts.dpd), dpd: facts.dpd });
    case "daysSinceLastPayment":
      return facts.lastPaymentDate ? r("last_payment", { days: x.daysSinceLastPayment }) : r("never_paid");
    case "missedEmis12m":
      return r("missed_emis", { n: x.missedEmis12m });
    case "brokenPromises90d":
      return r("broken_promises", { n: x.brokenPromises90d });
    case "keptPromises90d":
      return r("kept_promises", { n: x.keptPromises90d });
    case "notReachable14d":
      return r("not_reachable", { n: x.notReachable14d });
    case "openDispute":
      return r("dispute");
    case "hasActivePromise":
      return r("active_promise");
    case "logOutstanding":
      return r("amount", { amount: facts.outstanding });
    case "monthsOnBook":
      return r("months_on_book", { months: facts.monthsOnBook });
    default:
      return r(feature);
  }
}
