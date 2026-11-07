import Link from "next/link";
import { db } from "@/db/client";
import { serverNow } from "@/server/auth";
import { teamActivity } from "@/server/dashboard";
import { pageScope } from "@/server/scope";
import { istDate } from "@/domain/time";
import { PageHeader } from "@/components/Card";
import { time } from "@/components/format";
import { Pill } from "@/components/ui";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { branchId } = await pageScope(searchParams);
  const today = istDate(await serverNow());
  const team = await teamActivity(db, branchId, today);
  const q = branchId ? `?branch=${branchId}` : "";

  return (
    <>
      <PageHeader title="Team & lists" sub="Each officer's list is ordered by priority score. Open an officer to reorder, reassign or see today's visits." />
      {team.length === 0 ? (
        <p className="rounded-2xl border border-line bg-white p-10 text-center text-muted">No officers in this branch.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {team.map((t) => {
            const load = t.assigned / t.maxLoad;
            return (
              <Link key={t.id} href={`/manager/team/${t.id}${q}`} className="rounded-2xl border border-line bg-white p-5 hover:border-faint">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-xs text-muted">Pincodes {t.pincodes.join(", ")}</p>
                  </div>
                  {t.blockedToday > 0 && <Pill tone="danger">{t.blockedToday} blocked</Pill>}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="num text-xl font-semibold">{t.assigned}</p>
                    <p className="text-xs text-muted">on list</p>
                  </div>
                  <div>
                    <p className="num text-xl font-semibold">{t.highPriority}</p>
                    <p className="text-xs text-muted">score 60+</p>
                  </div>
                  <div>
                    <p className="num text-xl font-semibold">{t.visitedToday}</p>
                    <p className="text-xs text-muted">visited today</p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="h-1.5 rounded-full bg-surface" aria-label={`Workload ${t.assigned} of ${t.maxLoad}`}>
                    <div className={`h-full rounded-full ${load > 0.9 ? "bg-danger" : "bg-ink/70"}`} style={{ width: `${Math.min(load, 1) * 100}%` }} />
                  </div>
                  <p className="mt-1.5 flex justify-between text-xs text-muted">
                    <span>
                      Workload {t.assigned}/{t.maxLoad}
                    </span>
                    <span>Last sync {t.lastSyncAt ? time(t.lastSyncAt, "en") : "never"}</span>
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
