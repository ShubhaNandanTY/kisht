import Link from "next/link";
import { db } from "@/db/client";
import { serverNow } from "@/server/auth";
import { promiseBoard } from "@/server/dashboard";
import { pageScope } from "@/server/scope";
import { istDate } from "@/domain/time";
import { PageHeader } from "@/components/Card";
import { dateTime, day, inr } from "@/components/format";
import { Pill } from "@/components/ui";
import { RunDaily } from "./RunDaily";

const VIEWS = [
  ["today", "Due today"],
  ["upcoming", "Upcoming"],
  ["broken", "Broken"],
  ["kept", "Kept"],
] as const;

export default async function PromisesPage({ searchParams }: { searchParams: Promise<{ branch?: string; view?: string }> }) {
  const sp = await searchParams;
  const { branchId } = await pageScope(Promise.resolve(sp));
  const today = istDate(await serverNow());
  const all = await promiseBoard(db, branchId, today);
  const view = VIEWS.some(([k]) => k === sp.view) ? sp.view! : "today";
  const rows = all.filter((p) =>
    view === "today" ? p.status === "open" && p.promisedDate <= today : view === "upcoming" ? p.status === "open" && p.promisedDate > today : p.status === view,
  );
  const count = (k: string) =>
    all.filter((p) => (k === "today" ? p.status === "open" && p.promisedDate <= today : k === "upcoming" ? p.status === "open" && p.promisedDate > today : p.status === k)).length;
  const href = (k: string) => `?${[sp.branch ? `branch=${sp.branch}` : "", `view=${k}`].filter(Boolean).join("&")}`;

  return (
    <>
      <PageHeader
        title="Promises to pay"
        sub="Borrowers get an SMS reminder at 9 am the day before and on the day; officers get an in-app reminder on the day. Last 14 days and upcoming."
        action={<RunDaily />}
      />
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {VIEWS.map(([k, label]) => (
          <Link key={k} href={href(k)} className={`shrink-0 rounded-full px-4 py-2 text-sm ${view === k ? "bg-ink text-white" : "bg-white text-muted hover:text-ink"}`}>
            {label} <span className="num opacity-70">{count(k)}</span>
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">Nothing here.</p>
        ) : (
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-5 py-3 font-normal">Borrower</th>
                <th className="py-3 font-normal">Officer</th>
                <th className="py-3 text-right font-normal">Amount</th>
                <th className="py-3 text-right font-normal">Promised for</th>
                <th className="px-5 py-3 font-normal">Reminders</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium">{p.borrower}</p>
                    <p className="text-xs text-muted">
                      {p.loanId} · {p.dpd} DPD · promised {dateTime(p.createdAt, "en")}
                    </p>
                  </td>
                  <td className="py-3 text-muted">{p.officer}</td>
                  <td className="num py-3 text-right font-medium">{inr(p.amount)}</td>
                  <td className={`num py-3 text-right ${p.status === "broken" ? "text-danger" : ""}`}>{day(p.promisedDate, "en")}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.reminders.length === 0 && <span className="text-xs text-faint">–</span>}
                      {p.reminders.map((r, i) => (
                        <Pill key={i} tone={r.status === "sent" ? "success" : r.status === "blocked" ? "danger" : "neutral"}>
                          {r.templateId === "ptp_day_before" ? "Day before" : r.templateId === "ptp_due_today" ? "On the day" : "Reminder"} · {r.status}
                        </Pill>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
