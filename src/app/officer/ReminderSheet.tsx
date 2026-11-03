"use client";

import { useEffect, useState } from "react";
import { Button, Pill, Sheet, Spinner } from "@/components/ui";
import { useT } from "@/i18n/client";
import { checkContactWindow } from "@/domain/contactWindow";
import { clientNow } from "@/lib/clock";
import type { Draft } from "@/server/reminders";
import type { OfficerLoan } from "@/server/officer";

const TYPES = ["overdue_gentle", "ptp_day_before", "ptp_due_today", "broken_followup"] as const;

export function ReminderSheet({
  loan,
  open,
  onClose,
  onResult,
}: {
  loan: OfficerLoan;
  open: boolean;
  onClose: () => void;
  onResult: (msg: string, tone: "neutral" | "danger") => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [type, setType] = useState<string | undefined>(undefined);
  const [use, setUse] = useState<"ai" | "template">("ai");
  const [state, setState] = useState<"loading" | "ready" | "error" | "offline" | "sending">("loading");

  useEffect(() => {
    if (!open) return;
    if (!navigator.onLine) {
      setState("offline");
      return;
    }
    setState("loading");
    fetch("/api/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loanId: loan.id, templateId: type }) })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as Draft;
        setDraft(d);
        setUse(d.ai ? "ai" : "template");
        setState("ready");
      })
      .catch(() => setState(navigator.onLine ? "error" : "offline"));
  }, [open, loan.id, type]);

  // Only offer promise templates when there is a promise to refer to.
  const available = TYPES.filter((x) => {
    if (x === "overdue_gentle") return true;
    if (!loan.promise) return false;
    if (x === "broken_followup") return loan.promise.status === "broken";
    return loan.promise.status === "open";
  });

  const chosen = draft && (use === "ai" && draft.ai ? draft.ai : draft.template);
  const win = checkContactWindow(clientNow());

  async function send() {
    if (!draft || !chosen) return;
    setState("sending");
    try {
      const r = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanId: loan.id, templateId: draft.templateId, body: chosen.body, token: chosen.token, source: use === "ai" && draft.ai ? "ai" : "template" }),
      });
      const res = await r.json();
      if (!r.ok) throw new Error(res.error);
      onResult(res.status === "sent" ? t("draft.sent") : t("draft.blocked"), res.status === "sent" ? "neutral" : "danger");
      onClose();
    } catch {
      setState("error");
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("draft.title")}>
      {state === "offline" ? (
        <p className="py-6 text-center text-muted">{t("draft.offline")}</p>
      ) : (
        <>
          {available.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label={t("draft.choose")}>
              {available.map((x) => {
                const active = (draft?.templateId ?? type) === x;
                return (
                  <button
                    key={x}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setType(x)}
                    className={`h-9 rounded-full border px-3.5 text-sm ${active ? "border-ink bg-ink text-white" : "border-line"}`}
                  >
                    {t(`draft.type.${x}`)}
                  </button>
                );
              })}
            </div>
          )}

          {state === "loading" && (
            <div className="flex h-36 items-center justify-center text-muted">
              <Spinner />
            </div>
          )}
          {state === "error" && (
            <div className="py-6 text-center">
              <p className="text-muted">{t("common.error")}</p>
              <Button className="mt-3" size="sm" onClick={() => setType(type ? undefined : "overdue_gentle")}>
                {t("common.retry")}
              </Button>
            </div>
          )}
          {(state === "ready" || state === "sending") && draft && chosen && (
            <>
              {draft.ai && (
                <div className="mb-3 grid grid-cols-2 rounded-xl bg-surface p-1 text-sm">
                  {(["ai", "template"] as const).map((u) => (
                    <button key={u} type="button" onClick={() => setUse(u)} className={`h-9 rounded-lg ${use === u ? "bg-white font-medium shadow-sm" : "text-muted"}`}>
                      {t(u === "ai" ? "draft.ai" : "draft.template")}
                    </button>
                  ))}
                </div>
              )}
              <div className="rounded-2xl rounded-bl-md bg-accent-soft p-4 text-[15px] leading-relaxed" lang={draft.language}>
                {chosen.body}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <Pill tone={use === "ai" && draft.ai ? "info" : "neutral"}>{use === "ai" && draft.ai ? t("draft.aiBadge") : t("draft.templateBadge")}</Pill>
                <span>
                  SMS · {loan.phone.replace(/^(\d{2})\d{4}(\d{4})$/, "$1xxxx$2")}
                </span>
              </div>
              {draft.aiStatus === "rejected" && <p className="mt-3 text-xs text-warn">{t("draft.fallback", { why: (draft.aiProblems ?? []).join(", ") })}</p>}
              {draft.aiStatus === "off" && <p className="mt-3 text-xs text-faint">{t("draft.noAi")}</p>}
              {!win.allowed && <p className="mt-3 rounded-xl bg-warn-soft p-3 text-sm text-warn">{t("window.blocked.body")}</p>}
              <Button variant="primary" size="lg" className="mt-5 w-full" onClick={send} disabled={state === "sending"}>
                {state === "sending" ? <Spinner /> : t("draft.send")}
              </Button>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
