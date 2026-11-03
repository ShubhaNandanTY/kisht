import { db } from "@/db/client";
import { modelReport } from "@/server/dashboard";
import { pageScope } from "@/server/scope";
import { Card, PageHeader, Stat } from "@/components/Card";
import { CalibrationBars } from "@/components/charts";
import { day, pct } from "@/components/format";
import { Pill } from "@/components/ui";
import { Retrain } from "./Retrain";

const FEATURE_LABEL: Record<string, string> = {
  dpd: "Days past due",
  daysToNextBucket: "Days until next bucket (31/61/91)",
  daysSinceLastPayment: "Days since last payment",
  missedEmis12m: "Missed EMIs, last 12 months",
  brokenPromises90d: "Broken promises, 90 days",
  keptPromises90d: "Kept promises, 90 days",
  notReachable14d: "Not reachable, 14 days",
  openDispute: "Open dispute",
  hasActivePromise: "Promise pending",
  logOutstanding: "Outstanding amount (log)",
  monthsOnBook: "Months on book",
};

export default async function ModelPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { session } = await pageScope(searchParams);
  const r = await modelReport(db);
  const active = r.versions.find((v) => v.active);
  const oos = r.weeks.filter((w) => w.outOfSample);
  const capture = oos.length ? oos.reduce((s, w) => s + (w.topCapture ?? 0), 0) / oos.length : null;
  const weights = active ? active.params.features.map((f, i) => ({ f, w: active.params.weights[i] })).sort((a, b) => Math.abs(b.w) - Math.abs(a.w)) : [];
  const maxW = Math.max(...weights.map((x) => Math.abs(x.w)), 0.01);

  return (
    <>
      <PageHeader
        title="Priority model"
        sub="Each overdue loan gets a 0–100 score: the chance it rolls into the next DPD bucket before paying. Officers see the three inputs that moved it most."
        action={session.role === "head" ? <Retrain /> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ranking quality (AUC), held out" value={r.overall?.auc?.toFixed(2) ?? "–"} sub="0.5 is a coin toss, 1.0 is perfect. Measured on weeks the model never saw." />
        <Stat label="Rolls caught in the top 30%" value={pct(capture, 0)} sub="Share of loans that rolled which were in the top 30% of that day's scores" />
        <Stat label="Calibration error (Brier)" value={r.overall?.brier?.toFixed(3) ?? "–"} sub="Lower is better; a constant guess scores about 0.25" />
        <Stat
          label="Active model"
          value={active ? (active.params.kind === "rules" ? "Rules" : "Logistic") : "Rules"}
          sub={active ? <>Trained {day(active.trainedAt.toISOString().slice(0, 10), "en")} on {active.params.trainedOn?.n ?? 0} loan-days to {active.params.trainedOn?.to}</> : "No trained model: starting rules in use, marked low confidence"}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Predicted vs actual, by score band">
          <p className="-mt-1 mb-3 text-xs text-muted">Held-out weeks only. Bars of similar height mean the score can be read as a probability.</p>
          {r.overall ? <CalibrationBars bands={r.overall.calibration} /> : <p className="text-sm text-muted">Not enough matured history yet.</p>}
        </Card>

        <Card title="Weekly back-test">
          <p className="-mt-1 mb-3 text-xs text-muted">Every week, the scores loans had that day against whether they then rolled. Runs automatically; earlier weeks were used for training.</p>
          <div className="-mx-5 max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-xs text-muted">
                  <th className="px-5 pb-2 font-normal">Week of</th>
                  <th className="pb-2 text-right font-normal">Loans</th>
                  <th className="pb-2 text-right font-normal">Rolled</th>
                  <th className="pb-2 text-right font-normal">AUC</th>
                  <th className="px-5 pb-2 text-right font-normal">Top-30% catch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...r.weeks].reverse().map((w) => (
                  <tr key={w.week} className={w.outOfSample ? "" : "text-muted"}>
                    <td className="px-5 py-2">
                      {day(w.week, "en")} {w.outOfSample ? <Pill tone="info">held out</Pill> : <span className="text-xs text-faint">training</span>}
                    </td>
                    <td className="num text-right">{w.n}</td>
                    <td className="num text-right">{w.rolled}</td>
                    <td className={`num text-right ${w.auc !== null && w.auc < 0.65 ? "text-danger" : ""}`}>{w.auc?.toFixed(2) ?? "–"}</td>
                    <td className="num px-5 text-right">{pct(w.topCapture, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="What drives the score">
          <p className="-mt-1 mb-3 text-xs text-muted">Weight per standard deviation of each input. Signs are constrained so a reason never reads backwards (for example, a missed EMI can only raise risk).</p>
          <ul className="space-y-2">
            {weights.map(({ f, w }) => (
              <li key={f} className="grid grid-cols-[minmax(0,1fr)_120px_48px] items-center gap-3 text-sm">
                <span className="truncate">{FEATURE_LABEL[f] ?? f}</span>
                <span className="relative h-2 rounded-full bg-surface">
                  <span
                    className={`absolute inset-y-0 rounded-full ${w >= 0 ? "left-1/2 bg-danger/60" : "right-1/2 bg-accent/60"}`}
                    style={{ width: `${(Math.abs(w) / maxW) * 50}%` }}
                  />
                  <span className="absolute inset-y-[-3px] left-1/2 w-px bg-faint" />
                </span>
                <span className={`num text-right text-xs ${w === 0 ? "text-faint" : "text-muted"}`}>
                  {w > 0 ? "+" : ""}
                  {w.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="When the score is wrong">
          <ul className="space-y-3 text-sm text-muted">
            <li>
              <span className="font-medium text-ink">It is advisory.</span> Officers see the reasons and a confidence label, and can visit in any order. Low confidence (new loans, unusual cases, untrained model) is shown on the card.
            </li>
            <li>
              <span className="font-medium text-ink">Managers override it.</span> Pin and reorder any loan on an officer&apos;s list, or reassign it. Overrides are logged and reset at the next daily import.
            </li>
            <li>
              <span className="font-medium text-ink">It is checked every week.</span> The back-test above compares past scores with what happened. A retrained model only goes live if it ranks at least as well on held-out weeks.
            </li>
            <li>
              <span className="font-medium text-ink">If there is no model,</span> hand-set starting rules are used and every score is marked low confidence.
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
