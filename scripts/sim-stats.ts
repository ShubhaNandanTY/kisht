// Prints headline numbers from the demo simulation without touching the database.
import { simulate } from "../src/server/demo/simulate";
import { rollRates, trailingRollRate } from "../src/domain/rollRate";
import { trainWithBacktest } from "../src/server/training";
import { istDate } from "../src/domain/time";

const today = process.env.SEED_TODAY ?? istDate(new Date());
const t0 = Date.now();
const sim = simulate(today);
console.log(`simulated in ${Date.now() - t0}ms: loans ${sim.loans.length}, snapshots ${sim.snapshots.length}, outcomes ${sim.outcomes.length}, promises ${sim.promises.length}, attempts ${sim.attempts.length}`);
const live = sim.snapshots.filter((s) => s.asOfDate === today);
console.log(`overdue today: ${live.length} (1-30: ${live.filter((s) => s.dpd <= 30).length}, 31-60: ${live.filter((s) => s.dpd > 30 && s.dpd <= 60).length}, 61-90: ${live.filter((s) => s.dpd > 60).length})`);
const byOfficer = new Map<string, number>();
for (const s of live) byOfficer.set(s.officerId ?? "-", (byOfficer.get(s.officerId ?? "-") ?? 0) + 1);
console.log("per officer:", [...byOfficer.entries()].map(([k, v]) => `${k.slice(2)}:${v}`).join(" "));
for (const r of rollRates(sim.snapshots, { period: "month", byBranch: true, dataFrom: sim.dataFrom, dataTo: today }))
  console.log(r.period, r.branchId, r.entrants, r.rolled, r.rate?.toFixed(3) ?? `proj ${r.projectedRate?.toFixed(3)}`);
console.log("trailing", trailingRollRate(sim.snapshots, sim.dataFrom, today));
const kept = sim.promises.filter((p) => p.status === "kept").length, broken = sim.promises.filter((p) => p.status === "broken").length;
console.log(`promises kept ${kept} broken ${broken} open ${sim.promises.length - kept - broken}`);
const t1 = Date.now();
const { params, metrics } = trainWithBacktest(
  sim.snapshots,
  sim.loans.map((l) => ({ id: l.id, missedEmis12m: l.missedEmis12m, monthsOnBook: l.monthsOnBook, lastImportDate: today })),
  sim.promises,
  sim.outcomes,
  sim.dataFrom,
  today,
);
console.log(`trained in ${Date.now() - t1}ms on ${params.trainedOn?.n} rows (${params.trainedOn?.positives} pos); holdout n=${metrics.n} auc=${metrics.auc?.toFixed(3)} brier=${metrics.brier?.toFixed(3)} base=${metrics.baseRate?.toFixed(3)}`);
console.log(params.features.map((f, i) => `${f}=${params.weights[i].toFixed(2)}`).join(" "));
console.log(metrics.calibration);
