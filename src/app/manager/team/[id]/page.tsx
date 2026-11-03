import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { serverNow } from "@/server/auth";
import { officerDetail } from "@/server/dashboard";
import { pageScope } from "@/server/scope";
import { addDays, isIsoDate, istDate } from "@/domain/time";
import { Card, PageHeader } from "@/components/Card";
import { day, inr, time } from "@/components/format";
import { Pill } from "@/components/ui";
import { ListEditor } from "./ListEditor";
import { VisitMap } from "./VisitMap";

const FLAG_LABEL: Record<string, string> = {
  far_from_borrower: "Far from shop",
  no_gps: "No GPS",
  late_entry: "Late entry",
  logged_next_day: "Logged next day",
  synced_late: "Synced late",
  reassigned_since: "Reassigned",
  device_clock_suspect: "Clock suspect",
};

export default async function OfficerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ branch?: string; date?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { session, branchId } = await pageScope(Promise.resolve(sp));
  const today = istDate(await serverNow());
  const date = sp.date && isIsoDate(sp.date) && sp.date <= today ? sp.date : today;
  const d = await officerDetail(db, id, date);
  if (!d || (branchId && d.officer.branchId !== branchId) || (session.role === "manager" && d.officer.branchId !== session.branchId)) notFound();
  const q = (extra: string) => `?${[sp.branch ? `branch=${sp.branch}` : "", extra].filter(Boolean).join("&")}`;

  return (
    <>
      <Link href={`/manager/team${sp.branch ? `?branch=${sp.branch}` : ""}`} className="text-sm text-muted hover:text-ink">
        ← Team
      </Link>
      <PageHeader
        title={d.officer.name}
        sub={
          <>
            Pincodes {d.officer.pincodes.join(", ")} · {d.list.length} loans · last sync {d.officer.lastSyncAt ? `${day(istDate(new Date(d.officer.lastSyncAt)), "en")} ${time(d.officer.lastSyncAt, "en")}` : "never"}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Today's list">
          <p className="-mt-1 mb-3 text-xs text-muted">
            Ordered by score. Pin a loan to put it above the scored list for this officer; pins reset at the next daily import. The score is advisory.
          </p>
          <ListEditor loans={d.list} colleagues={d.colleagues.filter((c) => c.id !== d.officer.id)} />
        </Card>

        <div className="space-y-6">
          <Card
            title="Visits"
            action={
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4, 5, 6].map((n) => {
                  const dd = addDays(today, -n);
                  return (
                    <Link
                      key={dd}
                      href={q(`date=${dd}`)}
                      className={`rounded-lg px-2 py-1 text-xs ${dd === date ? "bg-ink text-white" : "text-muted hover:bg-surface"}`}
                    >
                      {n === 0 ? "Today" : day(dd, "en")}
                    </Link>
                  );
                })}
              </div>
            }
          >
            <VisitMap visits={d.visits.filter((v) => v.lat !== null && v.lng !== null).map((v) => ({ id: v.id, lat: v.lat!, lng: v.lng!, label: `${time(v.occurredAt, "en")} · ${v.borrower}`, far: v.flags.includes("far_from_borrower"), shopLat: v.loanLat, shopLng: v.loanLng }))} />
            {d.visits.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No visits logged on {day(date, "en")}.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {d.visits.map((v) => (
                  <li key={v.id} className="flex items-start gap-3 py-2.5 text-sm">
                    <span className="num w-16 shrink-0 text-muted">{time(v.occurredAt, "en")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{v.borrower}</span>
                      <span className="text-xs text-muted">
                        {v.type.replace("_", " ")}
                        {v.amount ? ` · ${inr(v.amount)}` : ""}
                        {v.note ? ` · ${v.note}` : ""}
                        {v.distanceM !== null ? ` · ${v.distanceM} m from shop` : ""}
                      </span>
                    </span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {v.flags.map((f) => (
                        <Pill key={f} tone={f === "far_from_borrower" || f === "device_clock_suspect" ? "danger" : "warn"}>
                          {FLAG_LABEL[f] ?? f}
                        </Pill>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Blocked contact attempts">
            {d.blocked.length === 0 ? (
              <p className="text-sm text-muted">None on {day(date, "en")}. Calls, messages and visits outside 8 am–7 pm are blocked and listed here.</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.blocked.map((b) => (
                  <li key={b.id} className="flex justify-between gap-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{b.borrower}</span>
                      <span className="text-muted"> · {b.channel}</span>
                    </span>
                    <span className="text-muted">
                      {time(b.at, "en")} · {b.reason?.replaceAll("_", " ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
