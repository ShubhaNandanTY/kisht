"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconDown, IconPin, IconUp } from "@/components/icons";
import { inr } from "@/components/format";
import { Pill, ScoreBadge, Spinner } from "@/components/ui";
import { translate } from "@/i18n/dict";
import type { Reason } from "@/db/schema";

type Loan = {
  id: string;
  borrowerName: string;
  businessType: string;
  pincode: string;
  dpd: number;
  overdueAmount: number;
  score: number | null;
  confidence: string | null;
  reasons: Reason[] | null;
  managerRank: number | null;
  assignmentNote: string | null;
};

const NOTE: Record<string, string> = { outside_territory: "Outside territory", over_capacity: "Over capacity", manager: "Reassigned by manager" };

export function ListEditor({ loans, colleagues }: { loans: Loan[]; colleagues: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, body: object, key: string) {
    setBusy(key);
    setError(null);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(null);
    if (!r.ok) {
      setError("That change was not saved. Try again.");
      return;
    }
    router.refresh();
  }

  if (!loans.length) return <p className="py-8 text-center text-sm text-muted">This officer has no overdue loans assigned.</p>;

  return (
    <>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <ol className="-mx-5 divide-y divide-line">
        {loans.map((l, i) => {
          const pinned = l.managerRank !== null;
          const top = (l.reasons ?? []).filter((r) => r.key.startsWith("reason.")).slice(0, 3);
          return (
            <li key={l.id} className={`px-5 py-3 ${pinned ? "bg-info-soft/50" : ""}`}>
              <div className="flex items-start gap-3">
                <span className="num w-5 pt-3 text-right text-xs text-faint">{i + 1}</span>
                <ScoreBadge score={l.score ?? 0} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-medium">{l.borrowerName}</p>
                    <p className="num shrink-0 text-sm">{inr(l.overdueAmount)}</p>
                  </div>
                  <p className="text-xs text-muted">
                    {l.id} · {l.businessType} · {l.dpd} DPD · {l.pincode}
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                    {top.map((r) => (
                      <li key={r.key}>
                        <span className={r.impact >= 0 ? "text-danger" : "text-accent"}>{r.impact >= 0 ? "↑" : "↓"}</span> {translate("en", r.key, r.params)}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {pinned && <Pill tone="info">Pinned #{l.managerRank}</Pill>}
                    {l.confidence === "low" && <Pill tone="warn">Low confidence</Pill>}
                    {l.assignmentNote && NOTE[l.assignmentNote] && <Pill>{NOTE[l.assignmentNote]}</Pill>}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-end gap-1 pl-8">
                {busy?.startsWith(l.id) && <Spinner className="mr-1 size-3.5 text-muted" />}
                {pinned ? (
                  <>
                    <IconBtn label="Move up" onClick={() => call("/api/manager/reorder", { loanId: l.id, action: "up" }, `${l.id}u`)}>
                      <IconUp className="size-4" />
                    </IconBtn>
                    <IconBtn label="Move down" onClick={() => call("/api/manager/reorder", { loanId: l.id, action: "down" }, `${l.id}d`)}>
                      <IconDown className="size-4" />
                    </IconBtn>
                    <button className="h-8 rounded-lg px-2.5 text-xs text-muted hover:bg-surface" onClick={() => call("/api/manager/reorder", { loanId: l.id, action: "clear" }, `${l.id}c`)}>
                      Unpin
                    </button>
                  </>
                ) : (
                  <button className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs text-muted hover:bg-surface" onClick={() => call("/api/manager/reorder", { loanId: l.id, action: "pin" }, `${l.id}p`)}>
                    <IconPin className="size-3.5" /> Pin to top
                  </button>
                )}
                {colleagues.length > 0 && (
                  <select
                    aria-label={`Reassign ${l.borrowerName}`}
                    defaultValue=""
                    onChange={(e) => e.target.value && call("/api/manager/reassign", { loanId: l.id, officerId: e.target.value }, `${l.id}r`)}
                    className="h-8 rounded-lg border border-line bg-white px-2 text-xs text-muted"
                  >
                    <option value="">Reassign…</option>
                    {colleagues.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink">
      {children}
    </button>
  );
}
