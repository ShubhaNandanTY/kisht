import Link from "next/link";
import { db } from "@/db/client";
import { serverNow } from "@/server/auth";
import { overview } from "@/server/dashboard";
import { pageScope } from "@/server/scope";
import { Card, PageHeader, Stat } from "@/components/Card";
import { RateBar, RateLines, type Series } from "@/components/charts";
import { branchColor } from "@/components/palette";
import { day, inr, pct, time } from "@/components/format";
import { Pill } from "@/components/ui";


function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { branchId } = await pageScope(searchParams);
  const now = await serverNow();
  const o = await overview(db, branchId, now);
  const q = branchId ? `?branch=${branchId}` : "";

  const months = [...new Set(o.byBranch.flatMap((b) => b.months.filter((m) => m.entrants >= 15).map((m) => m.period)))].sort();
  const series: Series[] = o.byBranch.map((b) => ({
    id: b.id,
    label: b.name,
    color: branchColor(b.id),
    // Cohorts with fewer than 15 loans are too noisy to plot (e.g. the first days of a month).
    points: b.months.filter((m) => m.entrants >= 15).map((m) => ({ x: m.period, y: m.rate, projected: !m.matured, n: m.entrants })),
  }));

  const rate = o.rollRate?.rate ?? null;
  const rateTone = rate === null ? "neutral" : rate <= o.target ? "good" : rate > o.baseline ? "bad" : "neutral";
  const scopeName = branchId ? o.byBranch[0]?.name : "All branches";

  return (
    <>
      <PageHeader
        title="Overview"
        sub={
          <>
            {scopeName} · {day(o.today, "en")} · {o.liveLoans} live overdue loans
          </>
        }
      />

      {o.stale && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warn/20 bg-warn-soft px-4 py-3 text-sm text-warn">
          <span>
            Today&apos;s overdue file has not been imported. Lists are from {o.fileDate ? day(o.fileDate, "en") : "no file yet"}.
          </span>
          <Link href={`/manager/import${q}`} className="font-medium underline underline-offset-2">
            Import now
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Roll rate 1–30 → 31+ DPD"
          value={pct(rate)}
          tone={rateTone}
          sub={
            o.rollRate ? (
              <>
                {o.rollRate.rolled} of {o.rollRate.entrants} loans that fell due {day(o.rollRate.windowStart, "en")}–{day(o.rollRate.windowEnd, "en")} · target {pct(o.target, 0)}
              </>
            ) : (
              "Needs 60 days of daily files"
            )
          }
        />
        <Stat
          label="Projected, loans falling due now"
          value={pct(o.projected)}
          tone={o.projected !== null && o.projected <= o.target ? "good" : "neutral"}
          sub={<>Model estimate for {o.projectedEntrants} loans still inside their first 30 days</>}
        />
        <Stat
          label="Visits logged the same day"
          value={pct(o.logging.sameDayRate)}
          tone={o.logging.sameDayRate !== null && o.logging.sameDayRate >= 0.95 ? "good" : "bad"}
          sub={<>{o.logging.visits7} visits in the last 7 days · target 95%</>}
        />
        <Stat
          label="Promises broken, last 7 days"
          value={String(o.promises.broken7)}
          tone={o.promises.broken7 > o.promises.kept7 ? "bad" : "neutral"}
          sub={
            <>
              {o.promises.kept7} kept · {o.promises.dueToday} due today
            </>
          }
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title="Roll rate by month of falling due">
          <p className="-mt-1 mb-4 text-xs text-muted">
            Share of loans that fell 1 day past due in each month and went on to reach 31 DPD. Months still maturing are projected from today&apos;s scores.
          </p>
          <RateLines
            series={series}
            xLabels={months.map((m) => ({ x: m, label: monthLabel(m) }))}
            refLines={[
              { y: o.baseline, label: `Baseline ${pct(o.baseline, 0)}` },
              { y: o.target, label: `Target ${pct(o.target, 0)}` },
            ]}
          />
        </Card>

        <Card title="By branch">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 font-normal">Branch</th>
                <th className="pb-2 text-right font-normal">Last 30-day cohort</th>
                <th className="pb-2 text-right font-normal">Projected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {o.byBranch.map((b) => (
                <tr key={b.id}>
                  <td className="py-3 pr-3">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="inline-block size-2 rounded-full" style={{ background: branchColor(b.id) }} aria-hidden />
                      {b.name}
                    </p>
                    <p className="text-xs text-muted">{b.liveLoans} live loans</p>
                    <div className="mt-2 max-w-48">
                      <RateBar value={b.trailing?.rate ?? null} target={o.target} color={branchColor(b.id)} />
                    </div>
                  </td>
                  <td className="num py-3 text-right align-top font-medium">
                    {pct(b.trailing?.rate)}
                    <p className="text-xs font-normal text-muted">
                      {b.trailing?.rolled}/{b.trailing?.entrants}
                    </p>
                  </td>
                  <td className="num py-3 text-right align-top text-muted">{pct(b.projected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-xs text-muted">
            Black tick = 16% target. {o.blockedAttempts30} contact attempts were blocked outside 8 am–7 pm in the last 30 days.
          </p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Team today" action={<Link href={`/manager/team${q}`} className="text-sm text-accent">All lists →</Link>}>
          <div className="-mx-5 overflow-x-auto" tabIndex={0} role="region" aria-label="Team today">
            <table className="w-full min-w-[440px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-5 pb-2 font-normal">Officer</th>
                  <th className="pb-2 text-right font-normal">List</th>
                  <th className="pb-2 text-right font-normal">Visited</th>
                  <th className="pb-2 text-right font-normal">Promises</th>
                  <th className="pr-5 pb-2 text-right font-normal">Last sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {o.team.map((t) => (
                  <tr key={t.id} className="hover:bg-surface">
                    <td className="px-5 py-2.5">
                      <Link href={`/manager/team/${t.id}${q}`} className="font-medium hover:underline">
                        {t.name}
                      </Link>
                      {t.blockedToday > 0 && (
                        <Pill tone="danger" className="ml-2">
                          {t.blockedToday} blocked
                        </Pill>
                      )}
                      {t.flagsToday > 0 && (
                        <Pill tone="warn" className="ml-2">
                          {t.flagsToday} far from shop
                        </Pill>
                      )}
                    </td>
                    <td className="num text-right">{t.assigned}</td>
                    <td className="num text-right">
                      {t.visitedToday}
                      <span className="text-faint">/{t.assigned}</span>
                    </td>
                    <td className="num text-right">{t.promisesToday}</td>
                    <td className="pr-5 text-right text-muted">{t.lastSyncAt ? time(t.lastSyncAt, "en") : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Broken promises, last 7 days" action={<Link href={`/manager/promises${q}`} className="text-sm text-accent">All promises →</Link>}>
          {o.promises.brokenList.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No broken promises this week.</p>
          ) : (
            <ul className="divide-y divide-line">
              {o.promises.brokenList.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.borrower}</span>
                    <span className="text-xs text-muted">
                      {p.loanId} · {p.officer} · now {p.dpd} DPD
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block font-medium text-danger">{inr(p.amount)}</span>
                    <span className="text-xs text-muted">due {day(p.promisedDate, "en")}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
