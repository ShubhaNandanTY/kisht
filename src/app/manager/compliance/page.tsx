import { db } from "@/db/client";
import { serverNow } from "@/server/auth";
import { complianceReport } from "@/server/dashboard";
import { pageScope } from "@/server/scope";
import { istDate } from "@/domain/time";
import { Card, PageHeader, Stat } from "@/components/Card";
import { dateTime, pct } from "@/components/format";
import { Pill } from "@/components/ui";

const REASON: Record<string, string> = {
  after_7pm: "After 7 pm",
  before_8am: "Before 8 am",
  outside_contact_hours: "Outside 8 am–7 pm",
  clock_in_future: "Phone clock ahead",
};
const FLAG: Record<string, [string, "danger" | "warn"]> = {
  far_from_borrower: ["Far from shop", "danger"],
  device_clock_suspect: ["Clock suspect", "danger"],
  late_entry: ["Late entry", "warn"],
  logged_next_day: ["Logged next day", "warn"],
  no_gps: ["No GPS", "warn"],
  reassigned_since: ["Reassigned", "warn"],
};
const ACTION: Record<string, string> = {
  login: "Signed in",
  import: "Imported daily file",
  reassign: "Reassigned a loan",
  "reorder.pin": "Pinned a loan",
  "reorder.up": "Moved a loan up",
  "reorder.down": "Moved a loan down",
  "reorder.clear": "Unpinned a loan",
  "model.retrain": "Retrained the model",
  "outcome.paid": "Logged a payment",
  "outcome.promise": "Logged a promise",
  "outcome.not_reachable": "Logged not reachable",
  "outcome.dispute": "Logged a dispute",
};

export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { branchId } = await pageScope(searchParams);
  const today = istDate(await serverNow());
  const r = await complianceReport(db, branchId, today);

  return (
    <>
      <PageHeader
        title="Compliance"
        sub="Last 30 days. RBI's recovery rules limit borrower contact to 8 am–7 pm; every attempt is recorded, including the ones the app blocked. Visit records whose location or timing needs a second look are listed for follow-up, not as proof of wrongdoing."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Contact attempts recorded" value={String(r.attempts)} sub="Calls, visits and reminders" />
        <Stat
          label="Blocked outside 8 am–7 pm"
          value={String(r.blockedCount)}
          tone={r.blockedCount ? "bad" : "good"}
          sub={<>{pct(r.attempts ? r.blockedCount / r.attempts : null)} of attempts; none reached a borrower</>}
        />
        <Stat label="Visits with GPS" value={pct(r.visits ? r.withGps / r.visits : null, 0)} sub={<>{r.counts.noGps} of {r.visits} without a location fix</>} />
        <Stat
          label="Visits to review"
          value={String(r.flagged.length)}
          tone={r.counts.far ? "bad" : "neutral"}
          sub={
            <>
              {r.counts.far} far from shop · {r.counts.late} late entries · {r.counts.nextDay} logged next day
            </>
          }
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Blocked contact attempts">
          {r.blocked.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No contact was attempted outside 8 am–7 pm.</p>
          ) : (
            <div className="-mx-5 max-h-[28rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs text-muted">
                    <th className="px-5 pb-2 font-normal">When</th>
                    <th className="pb-2 font-normal">Officer → borrower</th>
                    <th className="px-5 pb-2 text-right font-normal">Why blocked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.blocked.map((b) => (
                    <tr key={b.id}>
                      <td className="px-5 py-2.5 whitespace-nowrap text-muted">{dateTime(b.at, "en")}</td>
                      <td className="py-2.5">
                        <span className="font-medium">{b.officer}</span> <span className="text-muted">{b.channel} →</span> {b.borrower}
                        {b.viaSync && <span className="ml-1 text-xs text-faint">(logged offline)</span>}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <Pill tone="danger">{REASON[b.reason ?? ""] ?? b.reason}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Visits to review">
          {r.flagged.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Nothing to review.</p>
          ) : (
            <div className="-mx-5 max-h-[28rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs text-muted">
                    <th className="px-5 pb-2 font-normal">Visit</th>
                    <th className="pb-2 font-normal">Officer → borrower</th>
                    <th className="px-5 pb-2 text-right font-normal">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.flagged.map((v) => (
                    <tr key={v.id}>
                      <td className="px-5 py-2.5 whitespace-nowrap text-muted">{dateTime(v.occurredAt, "en")}</td>
                      <td className="py-2.5">
                        <span className="font-medium">{v.officer}</span> <span className="text-muted">→</span> {v.borrower}
                        {v.distanceM !== null && v.distanceM > 500 && <span className="block text-xs text-muted">{(v.distanceM / 1000).toFixed(1)} km from the shop</span>}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <span className="inline-flex flex-wrap justify-end gap-1">
                          {v.flags
                            .filter((f) => FLAG[f])
                            .map((f) => (
                              <Pill key={f} tone={FLAG[f][1]}>
                                {FLAG[f][0]}
                              </Pill>
                            ))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Audit log" className="mt-6">
        <p className="-mt-1 mb-3 text-xs text-muted">
          Who did what, for DPDP accountability: sign-ins, imports, overrides, retraining and outcome entries. Borrower data itself is never written to this log.
        </p>
        {r.audit.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">No activity yet.</p>
        ) : (
          <ul className="-mx-5 divide-y divide-line text-sm">
            {r.audit.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-4 px-5 py-2">
                <span>
                  <span className="font-medium">{a.user ?? "System"}</span> <span className="text-muted">{(ACTION[a.action] ?? a.action).toLowerCase()}</span>
                  {a.entityId && a.entity === "loans" && <span className="font-mono text-xs text-faint"> {a.entityId}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted">{dateTime(a.at, "en")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
