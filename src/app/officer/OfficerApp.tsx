"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LangToggle, useT } from "@/i18n/client";
import { Button, Dot, Empty, Pill, ScoreBadge, Sheet, Spinner, Toast } from "@/components/ui";
import { IconCal, IconClock, IconList, IconMore, IconRefresh } from "@/components/icons";
import { day, inr, time, weekdayDay } from "@/components/format";
import { checkContactWindow } from "@/domain/contactWindow";
import { istDate } from "@/domain/time";
import type { OutcomeEvent, SyncEvent } from "@/domain/sync";
import { clientNow } from "@/lib/clock";
import { uuid } from "@/lib/uuid";
import { enqueue, loadPayload, outbox, prune, savePayload, wipe, type OutboxItem } from "@/lib/offline/store";
import { flush, refreshCount, subscribe, type SyncState } from "@/lib/offline/sync";
import type { OfficerLoan, OfficerPayload } from "@/server/officer";
import { LoanDetail, PromiseLine } from "./LoanDetail";
import { OutcomeSheet } from "./OutcomeSheet";
import { ReminderSheet } from "./ReminderSheet";
import { DemoClock } from "@/components/DemoClock";

type Tab = "today" | "promises" | "day";

/**
 * Re-applies events still waiting in the outbox on top of the last payload from the server,
 * so the officer sees their own work immediately even with no signal.
 */
function withLocal(p: OfficerPayload, items: OutboxItem[]): OfficerPayload {
  const known = new Set(p.log.map((l) => l.id));
  const local = items.filter((i) => i.status !== "rejected" && !known.has(i.id) && i.event.kind === "outcome") as (OutboxItem & { event: OutcomeEvent })[];
  if (!local.length) return p;
  const loans = p.loans.map((l) => {
    const mine = local.filter((i) => i.event.loanId === l.id);
    if (!mine.length) return l;
    const promiseEvent = [...mine].reverse().find((i) => i.event.type === "promise")?.event;
    return {
      ...l,
      visitedToday: true,
      promise: promiseEvent ? { id: `p-${promiseEvent.id}`, promisedDate: promiseEvent.promisedDate!, amount: promiseEvent.amount!, status: "open" } : l.promise,
      history: [
        ...mine.reverse().map((i) => ({ id: i.id, type: i.event.type, amount: i.event.amount ?? null, occurredAt: i.event.occurredAt, distanceM: null, gpsStatus: i.event.gps.status })),
        ...l.history,
      ].slice(0, 5),
    };
  });
  return { ...p, loans };
}

export function OfficerApp({ officerId, demo }: { officerId: string; demo: boolean }) {
  const { t, lang } = useT();
  const [payload, setPayload] = useState<OfficerPayload | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [fresh, setFresh] = useState(false);
  const [sync, setSync] = useState<SyncState>({ phase: "idle", pending: 0, lastSyncedAt: null });
  const [tab, setTab] = useState<Tab>("today");
  const [openLoan, setOpenLoan] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"outcome" | "reminder" | "blocked" | "menu" | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "neutral" | "danger" } | null>(null);
  const [now, setNow] = useState(() => clientNow());

  const reloadOutbox = useCallback(async () => setItems(await outbox(officerId)), [officerId]);

  const fetchToday = useCallback(async () => {
    try {
      const r = await fetch("/api/officer/today", { cache: "no-store" });
      if (r.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const p = (await r.json()) as OfficerPayload;
      setPayload(p);
      setSavedAt(Date.now());
      setFresh(true);
      setLoadState("ready");
      await savePayload(officerId, p);
    } catch {
      setFresh(false);
      setLoadState((s) => (s === "loading" ? "error" : s));
    }
  }, [officerId]);

  // Cached list first (instant, works offline), then the network.
  useEffect(() => {
    (async () => {
      const cached = await loadPayload(officerId).catch(() => undefined);
      if (cached) {
        setPayload(cached.payload);
        setSavedAt(cached.savedAt);
        setLoadState("ready");
      }
      await reloadOutbox();
      await refreshCount(officerId);
      await prune(officerId).catch(() => {});
      await fetchToday();
      flush(officerId, async () => {
        await reloadOutbox();
        await fetchToday();
      });
    })();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => {
          const assets = performance
            .getEntriesByType("resource")
            .map((e) => new URL(e.name).pathname)
            .filter((p) => p.startsWith("/_next/static/"));
          reg.active?.postMessage({ type: "precache", urls: ["/officer", ...new Set(assets)] });
        })
        .catch(() => {});
    }
  }, [officerId, fetchToday, reloadOutbox]);

  useEffect(() => subscribe(setSync), []);

  // Retry sync when the signal comes back, when the app comes to the front, and every 30 s.
  useEffect(() => {
    const go = () =>
      flush(officerId, async () => {
        await reloadOutbox();
        await fetchToday();
      });
    const onVisible = () => document.visibilityState === "visible" && (go(), fetchToday());
    window.addEventListener("online", go);
    document.addEventListener("visibilitychange", onVisible);
    const iv = setInterval(() => {
      setNow(clientNow());
      go();
    }, 30_000);
    return () => {
      window.removeEventListener("online", go);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(iv);
    };
  }, [officerId, reloadOutbox, fetchToday]);

  // Android back button closes the detail view instead of leaving the app.
  useEffect(() => {
    const onPop = () => setOpenLoan(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const view = useMemo(() => (payload ? withLocal(payload, items) : null), [payload, items]);
  const loan = view?.loans.find((l) => l.id === openLoan) ?? null;
  const win = checkContactWindow(now);
  const today = istDate(now);

  const open = (id: string) => {
    window.history.pushState({ loan: id }, "");
    setOpenLoan(id);
    window.scrollTo(0, 0);
  };
  const back = () => window.history.back();

  async function queue(e: SyncEvent) {
    await enqueue(officerId, e);
    await reloadOutbox();
    await refreshCount(officerId);
    flush(officerId, async () => {
      await reloadOutbox();
      await fetchToday();
    });
  }

  async function onCall() {
    if (!loan) return;
    const at = clientNow();
    const w = checkContactWindow(at);
    // Every attempt is recorded, including the ones the rule blocks.
    await queue({ kind: "attempt", id: uuid(), loanId: loan.id, channel: "call", at: at.toISOString(), allowed: w.allowed, blockReason: w.allowed ? undefined : w.reason });
    if (!w.allowed) {
      setSheet("blocked");
      return;
    }
    window.location.href = `tel:+91${loan.phone}`;
  }

  async function onSaveOutcome(e: OutcomeEvent) {
    await queue(e);
    setSheet(null);
    const synced = navigator.onLine && sync.phase !== "error" && sync.phase !== "offline";
    setToast({ msg: synced ? t("outcome.saved") : t("outcome.savedOffline"), tone: "neutral" });
  }

  async function signOut() {
    const pending = items.filter((i) => i.status === "pending").length;
    if (pending && !confirm(`${t("sync.pending", { n: pending })}. ${t("common.signout")}?`)) return;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    await wipe();
    window.location.href = "/login";
  }

  if (loadState === "loading" && !view) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (loadState === "error" && !view) {
    return (
      <Empty
        title={t("common.error")}
        body={t("common.offline")}
        action={
          <Button onClick={() => fetchToday()}>
            <IconRefresh className="size-4" />
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (!view) return null;

  const pendingCount = sync.pending;
  const syncPill =
    sync.phase === "auth" ? (
      <Pill tone="danger">{t("sync.relogin")}</Pill>
    ) : sync.phase === "offline" ? (
      <Pill tone="warn">
        <Dot tone="warn" />
        {pendingCount ? t("sync.offline", { n: pendingCount }) : t("sync.offline.zero")}
      </Pill>
    ) : sync.phase === "syncing" ? (
      <Pill tone="info">
        <Spinner className="size-3" />
        {t("sync.syncing")}
      </Pill>
    ) : sync.phase === "error" ? (
      <Pill tone="warn">{t("sync.failed")}</Pill>
    ) : pendingCount ? (
      <Pill tone="warn">{t("sync.pending", { n: pendingCount })}</Pill>
    ) : (
      <Pill tone="success">
        <Dot tone="success" />
        {t("sync.synced")}
      </Pill>
    );
  const windowPill = win.allowed ? (
    <Pill tone="neutral">
      <IconClock className="size-3.5" />
      {t("window.open.short")}
    </Pill>
  ) : (
    <Pill tone="danger">
      <IconClock className="size-3.5" />
      {t("window.closed.short", { time: time(win.opensAt, lang) })}
    </Pill>
  );

  const todo = view.loans.filter((l) => !l.visitedToday);
  const done = view.loans.filter((l) => l.visitedToday);
  const promisedToday = view.promises.filter((p) => p.status === "open" && p.promisedDate === today).length;
  const broken = view.promises.filter((p) => p.status === "broken").length;
  // Today's work so far: what the server has, plus anything still waiting in the outbox.
  const logged = new Set(view.log.map((l) => l.id));
  const todaysOutcomes = [
    ...view.log.filter((l) => l.kind === "outcome").map((l) => ({ type: l.type, amount: l.amount })),
    ...items
      .filter((i) => i.status !== "rejected" && !logged.has(i.id) && i.event.kind === "outcome" && istDate(new Date(i.event.occurredAt)) === today)
      .map((i) => (i.event.kind === "outcome" ? { type: i.event.type, amount: i.event.amount ?? null } : { type: "", amount: null })),
  ];
  const collected = todaysOutcomes.filter((o) => o.type === "paid").reduce((sum, o) => sum + (o.amount ?? 0), 0);
  const promisesTaken = todaysOutcomes.filter((o) => o.type === "promise").length;
  const progress = view.loans.length ? done.length / view.loans.length : 0;

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-white">
      {loan ? (
        <LoanDetail loan={loan} onBack={back} onCall={onCall} onRemind={() => setSheet("reminder")} onLog={() => setSheet("outcome")} pending={false} />
      ) : (
        <div className="pb-28">
          <header className="px-5 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{t("officer.greeting", { name: view.officer.name.split(" ")[0] })}</p>
                <p className="text-sm text-muted">
                  {weekdayDay(today, lang)} · {lang === "hi" ? view.officer.branchNameHi : view.officer.branchName}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <LangToggle />
                <button onClick={() => setSheet("menu")} className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface" aria-label="Menu">
                  <IconMore />
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {syncPill}
              {windowPill}
            </div>
            {!fresh && savedAt && (
              <p className="mt-3 rounded-xl bg-surface px-3 py-2 text-xs text-muted">{t("officer.stale", { time: time(new Date(savedAt), lang) })}</p>
            )}
          </header>

          {tab === "today" && (
            <>
              {view.loans.length > 0 && (
                <section className="mx-5 mt-5 rounded-2xl bg-surface px-4 py-3.5" aria-label={t("officer.progress", { done: done.length, total: view.loans.length })}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold">{t("officer.progress", { done: done.length, total: view.loans.length })}</p>
                    {collected > 0 && <p className="num text-sm font-medium text-accent">{t("officer.collected", { amount: collected })}</p>}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white" aria-hidden>
                    <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                  <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{t("officer.summary", { n: todo.length })}</span>
                    {promisedToday > 0 && <span className="text-info">{t("officer.summary.promises", { n: promisedToday })}</span>}
                    {broken > 0 && <span className="text-danger">{t("officer.summary.broken", { n: broken })}</span>}
                    {promisesTaken > 0 && <span>{t("officer.promisesTaken", { n: promisesTaken })}</span>}
                  </p>
                </section>
              )}
              {view.loans.length === 0 ? (
                <Empty title={t("officer.empty.title")} body={t("officer.empty.body")} action={<Button onClick={fetchToday}>{t("officer.refresh")}</Button>} />
              ) : (
                <>
                  <ul className="mt-2 divide-y divide-line border-y border-line">
                    {todo.map((l) => (
                      <LoanRow key={l.id} loan={l} onOpen={() => open(l.id)} />
                    ))}
                  </ul>
                  {done.length > 0 && (
                    <details className="group mt-6">
                      <summary className="cursor-pointer list-none px-5 py-2 text-sm font-medium text-muted">
                        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> {t("officer.done", { n: done.length })}
                      </summary>
                      <ul className="divide-y divide-line border-y border-line opacity-70">
                        {done.map((l) => (
                          <LoanRow key={l.id} loan={l} onOpen={() => open(l.id)} done />
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </>
          )}

          {tab === "promises" && <PromisesTab view={view} today={today} onOpen={open} />}
          {tab === "day" && <DayTab view={view} items={items} today={today} />}

          <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto grid max-w-lg grid-cols-3">
              {(
                [
                  ["today", IconList, "officer.tab.today"],
                  ["promises", IconCal, "officer.tab.promises"],
                  ["day", IconClock, "officer.tab.day"],
                ] as const
              ).map(([k, Icon, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  aria-current={tab === k ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${tab === k ? "text-accent" : "text-muted"}`}
                >
                  <Icon className="size-5" />
                  {t(label)}
                </button>
              ))}
            </div>
          </nav>
        </div>
      )}

      {loan && <OutcomeSheet loan={loan} open={sheet === "outcome"} onClose={() => setSheet(null)} onSave={onSaveOutcome} />}
      {loan && <ReminderSheet loan={loan} open={sheet === "reminder"} onClose={() => setSheet(null)} onResult={(msg, tone) => setToast({ msg, tone })} />}
      <Sheet open={sheet === "blocked"} onClose={() => setSheet(null)} title={t("window.blocked.title")}>
        <p className="text-muted">{t("window.blocked.body")}</p>
        {!win.allowed && <p className="mt-3 font-medium">{t("window.closed", { time: time(win.opensAt, lang) })}</p>}
        <Button className="mt-5 w-full" size="lg" onClick={() => setSheet(null)}>
          {t("common.close")}
        </Button>
      </Sheet>
      <Sheet open={sheet === "menu"} onClose={() => setSheet(null)}>
        <div className="space-y-2">
          <Button
            className="w-full"
            onClick={() => {
              fetchToday();
              setSheet(null);
            }}
          >
            <IconRefresh className="size-4" />
            {t("officer.refresh")}
          </Button>
          {demo && <DemoClock onChange={() => setNow(clientNow())} />}
          <Button variant="danger" className="w-full" onClick={signOut}>
            {t("common.signout")}
          </Button>
        </div>
      </Sheet>
      <Toast message={toast?.msg ?? null} tone={toast?.tone} onDone={() => setToast(null)} />
    </div>
  );
}

function LoanRow({ loan, onOpen, done = false }: { loan: OfficerLoan; onOpen: () => void; done?: boolean }) {
  const { t } = useT();
  const top = loan.reasons.find((r) => r.key.startsWith("reason.") && r.impact > 0) ?? loan.reasons.find((r) => r.key.startsWith("reason."));
  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-start gap-3.5 px-5 py-4 text-left active:bg-surface">
        <ScoreBadge score={loan.score} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-[17px] font-semibold">{loan.borrowerName}</p>
            <p className="num shrink-0 font-medium">{inr(loan.overdueAmount)}</p>
          </div>
          <p className="truncate text-sm text-muted">
            {loan.businessType} · {loan.dpd} {t("common.dpd")}
          </p>
          {top && !done && <p className="mt-1 text-sm">{t(top.key, top.params)}</p>}
          {(loan.promise || loan.managerRank !== null || done) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {done && <Pill tone="success">{t("officer.visited")}</Pill>}
              {loan.managerRank !== null && <Pill tone="info">{t("officer.pinned")}</Pill>}
              {loan.promise && loan.promise.status !== "kept" && <PromiseLine promise={loan.promise} />}
            </div>
          )}
        </div>
      </button>
    </li>
  );
}

function PromisesTab({ view, today, onOpen }: { view: OfficerPayload; today: string; onOpen: (id: string) => void }) {
  const { t, lang } = useT();
  const groups: [string, typeof view.promises][] = [
    ["promises.dueToday", view.promises.filter((p) => p.status === "open" && p.promisedDate <= today)],
    ["promises.upcoming", view.promises.filter((p) => p.status === "open" && p.promisedDate > today)],
    ["promises.broken", view.promises.filter((p) => p.status === "broken")],
  ];
  return (
    <div className="mt-4">
      {groups.map(([title, rows]) => (
        <section key={title} className="mt-4">
          <h2 className="px-5 pb-2 text-xs font-medium tracking-wide text-muted uppercase">
            {t(title)} <span className="num">({rows.length})</span>
          </h2>
          {rows.length === 0 ? (
            <p className="px-5 pb-2 text-sm text-faint">{t("promises.empty")}</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {rows.map((p) => (
                <li key={`${p.loanId}-${p.status}`}>
                  <button onClick={() => onOpen(p.loanId)} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left active:bg-surface">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.borrowerName}</span>
                      <span className="text-sm text-muted">{day(p.promisedDate, lang)}</span>
                    </span>
                    <span className={`num shrink-0 font-medium ${p.status === "broken" ? "text-danger" : ""}`}>{inr(p.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function DayTab({ view, items, today }: { view: OfficerPayload; items: OutboxItem[]; today: string }) {
  const { t, lang } = useT();
  const names = new Map(view.loans.map((l) => [l.id, l.borrowerName]));
  const serverIds = new Set(view.log.map((l) => l.id));
  type Row = { id: string; at: string; who: string; what: string; state: "synced" | "pending" | "rejected"; blocked: boolean; reason?: string };
  const rows: Row[] = [
    ...view.log.map((l) => ({
      id: l.id,
      at: l.at,
      who: l.borrowerName,
      what: l.kind === "blocked" ? t("day.blocked") : t(`outcome.${l.type}`) + (l.amount ? ` · ${inr(l.amount)}` : ""),
      state: "synced" as const,
      blocked: l.kind === "blocked",
    })),
    ...items
      .filter((i) => !serverIds.has(i.id) && istDate(new Date(i.event.kind === "outcome" ? i.event.occurredAt : i.event.at)) === today)
      .filter((i) => i.event.kind === "outcome" || !i.event.allowed)
      .map((i) => ({
        id: i.id,
        at: i.event.kind === "outcome" ? i.event.occurredAt : i.event.at,
        who: names.get(i.event.loanId) ?? i.event.loanId,
        what: i.event.kind === "outcome" ? t(`outcome.${i.event.type}`) + (i.event.amount ? ` · ${inr(i.event.amount)}` : "") : t("day.blocked"),
        state: i.status,
        blocked: i.event.kind === "attempt",
        reason: i.reason,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <section className="mt-6">
      <h2 className="px-5 pb-2 text-xs font-medium tracking-wide text-muted uppercase">{t("day.title")}</h2>
      {rows.length === 0 ? (
        <Empty title={t("day.empty")} />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3">
              <span className="num w-16 shrink-0 text-sm text-muted">{time(r.at, lang)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.who}</span>
                <span className={`text-sm ${r.blocked ? "text-danger" : "text-muted"}`}>{r.what}</span>
              </span>
              <Pill tone={r.state === "synced" ? "success" : r.state === "pending" ? "warn" : "danger"}>
                {t(`day.state.${r.state}`)}
                {r.reason ? ` · ${r.reason}` : ""}
              </Pill>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
