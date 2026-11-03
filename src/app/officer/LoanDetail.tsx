"use client";

import { Button, Pill, ScoreBadge } from "@/components/ui";
import { IconBack, IconMsg, IconNav, IconPhone } from "@/components/icons";
import { day, dateTime, inr, inrShort } from "@/components/format";
import { useT } from "@/i18n/client";
import { nextBucket } from "@/domain/scoring/features";
import type { OfficerLoan } from "@/server/officer";

export function ReasonList({ reasons, compact = false }: { reasons: OfficerLoan["reasons"]; compact?: boolean }) {
  const { t } = useT();
  const items = reasons.filter((r) => r.key.startsWith("reason."));
  const max = Math.max(...items.map((r) => Math.abs(r.impact)), 1);
  return (
    <ul className={compact ? "space-y-1.5" : "space-y-3"}>
      {items.map((r) => {
        const up = r.impact >= 0;
        return (
          <li key={r.key} className="flex items-center gap-3">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${up ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent"}`} aria-hidden>
              {up ? "↑" : "↓"}
            </span>
            <span className="min-w-0 flex-1 text-[15px]">{t(r.key, r.params)}</span>
            {!compact && (
              <span className="flex w-16 shrink-0 items-center justify-end gap-1.5">
                <span className={`h-1.5 rounded-full ${up ? "bg-danger/50" : "bg-accent/50"}`} style={{ width: `${Math.max((Math.abs(r.impact) / max) * 36, 4)}px` }} />
                <span className="num w-7 text-right text-xs text-muted">
                  {up ? "+" : "−"}
                  {Math.abs(r.impact)}
                </span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function PromiseLine({ promise }: { promise: NonNullable<OfficerLoan["promise"]> }) {
  const { t, lang } = useT();
  if (promise.status === "broken") return <Pill tone="danger">{t("loan.promise.broken", { date: day(promise.promisedDate, lang) })}</Pill>;
  if (promise.status === "kept") return <Pill tone="success">{t("loan.promise.kept", { date: day(promise.promisedDate, lang) })}</Pill>;
  return <Pill tone="info">{t("loan.promise.open", { date: day(promise.promisedDate, lang), amount: promise.amount })}</Pill>;
}

export function LoanDetail({
  loan,
  onBack,
  onCall,
  onRemind,
  onLog,
  pending,
}: {
  loan: OfficerLoan;
  onBack: () => void;
  onCall: () => void;
  onRemind: () => void;
  onLog: () => void;
  pending: boolean;
}) {
  const { t, lang } = useT();
  const confidenceReason = loan.reasons.find((r) => r.key.startsWith("confidence."));
  const directions = loan.lat !== null && loan.lng !== null ? `https://www.google.com/maps/dir/?api=1&destination=${loan.lat},${loan.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loan.address)}`;

  return (
    <div className="animate-fade pb-32">
      <div className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-line bg-white/95 px-2 backdrop-blur">
        <button onClick={onBack} className="grid size-11 place-items-center rounded-full hover:bg-surface" aria-label={t("common.back")}>
          <IconBack />
        </button>
        <span className="num text-sm text-muted">{loan.id}</span>
      </div>

      <div className="px-5 pt-5">
        <h1 className="text-[22px] leading-tight font-semibold">{loan.borrowerName}</h1>
        <p className="mt-1 text-muted">{loan.businessType}</p>
        <p className="mt-1 text-sm text-faint">{loan.address}</p>
        {loan.promise && (
          <div className="mt-3">
            <PromiseLine promise={loan.promise} />
          </div>
        )}
      </div>

      <section className="mx-5 mt-6 rounded-3xl border border-line p-5">
        <div className="flex items-center gap-4">
          <ScoreBadge score={loan.score} size="lg" />
          <div className="min-w-0">
            <p className="text-sm text-muted">{t("loan.priority")}</p>
            <p className="text-[15px] leading-snug">{t("loan.chance", { p: loan.score, bucket: nextBucket(loan.dpd) })}</p>
          </div>
        </div>
        <h2 className="mt-5 mb-3 text-xs font-medium tracking-wide text-muted uppercase">{t("loan.why")}</h2>
        <ReasonList reasons={loan.reasons} />
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-muted">
          <Pill tone={loan.confidence === "high" ? "neutral" : "warn"}>{t(`loan.confidence.${loan.confidence}`)}</Pill>
          {confidenceReason && <span>{t(confidenceReason.key)}</span>}
        </div>
        <p className="mt-2 text-xs text-faint">{t("loan.advisory")}</p>
      </section>

      <dl className="mx-5 mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-3xl border border-line bg-line">
        {[
          [t("loan.overdue"), inr(loan.overdueAmount)],
          [t("common.dpd"), String(loan.dpd)],
          [t("loan.outstanding"), inrShort(loan.outstanding)],
          [t("loan.emi"), inr(loan.emiAmount)],
          [t("loan.lastPayment"), loan.lastPaymentDate ? day(loan.lastPaymentDate, lang) : t("loan.never")],
          [t("loan.missed"), String(loan.missedEmis12m)],
        ].map(([k, v]) => (
          <div key={k} className="bg-white px-3 py-3">
            <dt className="truncate text-xs text-muted">{k}</dt>
            <dd className="num mt-0.5 font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="mx-5 mt-6">
        <h2 className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">{t("loan.history")}</h2>
        {loan.history.length === 0 ? (
          <p className="text-sm text-faint">{t("loan.history.empty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {loan.history.map((h) => (
              <li key={h.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                <span>
                  {t(`outcome.${h.type}`)}
                  {h.amount ? <span className="num text-muted"> · {inr(h.amount)}</span> : null}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {dateTime(h.occurredAt, lang)} ·{" "}
                  {h.gpsStatus !== "ok" || h.distanceM === null
                    ? t("loan.gps.none")
                    : h.distanceM <= 500
                      ? t("loan.gps.near")
                      : t("loan.gps.far", { m: h.distanceM })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mx-5 mt-6 grid grid-cols-3 gap-3">
        <button onClick={onCall} className="flex h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border border-line text-sm font-medium hover:bg-surface">
          <IconPhone className="size-5 text-accent" />
          {t("loan.call")}
        </button>
        <a href={directions} target="_blank" rel="noopener noreferrer" className="flex h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border border-line text-sm font-medium hover:bg-surface">
          <IconNav className="size-5 text-accent" />
          {t("loan.directions")}
        </a>
        <button onClick={onRemind} className="flex h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border border-line text-sm font-medium hover:bg-surface">
          <IconMsg className="size-5 text-accent" />
          {t("loan.remind")}
        </button>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-lg">
          <Button variant="primary" size="lg" className="w-full" onClick={onLog} disabled={pending}>
            {t("loan.log")}
          </Button>
        </div>
      </div>
    </div>
  );
}
