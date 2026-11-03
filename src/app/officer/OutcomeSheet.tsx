"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Sheet } from "@/components/ui";
import { IconAlert, IconCal, IconCheck, IconPin, IconRupee, IconX } from "@/components/icons";
import { useT } from "@/i18n/client";
import { checkContactWindow } from "@/domain/contactWindow";
import { addDays, istDate, istInstant } from "@/domain/time";
import { clientNow } from "@/lib/clock";
import { uuid } from "@/lib/uuid";
import type { OutcomeEvent } from "@/domain/sync";
import type { OfficerLoan } from "@/server/officer";
import { inr } from "@/components/format";

type Gps = OutcomeEvent["gps"];
type Kind = OutcomeEvent["type"];

const NOTES: Record<Kind, string[]> = {
  paid: [],
  promise: [],
  not_reachable: ["shop_closed", "phone_off", "moved"],
  dispute: ["amount", "paid_already", "other"],
};

/** Starts a GPS read as soon as the sheet opens, so the fix is usually ready by the third tap. */
function useGps(active: boolean): Gps | null {
  const [gps, setGps] = useState<Gps | null>(null);
  useEffect(() => {
    if (!active) return;
    setGps(null);
    if (!("geolocation" in navigator)) {
      setGps({ status: "unavailable" });
      return;
    }
    let done = false;
    const stop = setTimeout(() => !done && setGps({ status: "timeout" }), 12_000);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        done = true;
        clearTimeout(stop);
        setGps({ status: "ok", lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) });
      },
      (err) => {
        done = true;
        clearTimeout(stop);
        setGps({ status: err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable" });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 120_000 },
    );
    return () => clearTimeout(stop);
  }, [active]);
  return gps;
}

export function OutcomeSheet({
  loan,
  open,
  onClose,
  onSave,
}: {
  loan: OfficerLoan;
  open: boolean;
  onClose: () => void;
  onSave: (e: OutcomeEvent) => Promise<void>;
}) {
  const { t } = useT();
  const [kind, setKind] = useState<Kind | null>(null);
  const [amount, setAmount] = useState(String(loan.overdueAmount));
  const [days, setDays] = useState(1);
  const [note, setNote] = useState<string | null>(null);
  const [lateTime, setLateTime] = useState("18:30");
  const [saving, setSaving] = useState(false);
  const gps = useGps(open);

  const now = clientNow();
  const win = checkContactWindow(now);
  const today = istDate(now);

  useEffect(() => {
    if (open) {
      setKind(null);
      setAmount(String(loan.promise?.status === "open" ? loan.promise.amount : loan.overdueAmount));
      setDays(1);
      setNote(null);
      setSaving(false);
    }
  }, [open, loan]);

  const lateValid = useMemo(() => {
    if (win.allowed) return true;
    if (win.reason === "before_8am") return false; // nothing could have happened yet today
    return /^\d{2}:\d{2}$/.test(lateTime) && lateTime >= "08:00" && lateTime < "19:00";
  }, [win, lateTime]);

  const amt = Number(amount.replace(/[^\d]/g, ""));
  const needsAmount = kind === "paid" || kind === "promise";
  const canSave = !!kind && (!needsAmount || amt > 0) && lateValid && !saving;

  async function save() {
    if (!kind || !canSave) return;
    setSaving(true);
    const captured = clientNow();
    const occurred = win.allowed ? captured : istInstant(today, Number(lateTime.slice(0, 2)), Number(lateTime.slice(3)));
    await onSave({
      kind: "outcome",
      id: uuid(),
      loanId: loan.id,
      type: kind,
      amount: needsAmount ? amt : undefined,
      promisedDate: kind === "promise" ? addDays(today, days) : undefined,
      note: note ? t(`outcome.note.${note}`) : undefined,
      occurredAt: occurred.toISOString(),
      capturedAt: captured.toISOString(),
      gps: gps ?? { status: "timeout" },
    });
    setSaving(false);
  }

  const tiles: { k: Kind; icon: React.ReactNode; tone: string }[] = [
    { k: "paid", icon: <IconRupee className="size-6" />, tone: "text-accent" },
    { k: "promise", icon: <IconCal className="size-6" />, tone: "text-info" },
    { k: "not_reachable", icon: <IconX className="size-6" />, tone: "text-muted" },
    { k: "dispute", icon: <IconAlert className="size-6" />, tone: "text-warn" },
  ];

  return (
    <Sheet open={open} onClose={onClose} title={t("outcome.title")}>
      <p className="-mt-3 mb-4 truncate text-sm text-muted">
        {loan.borrowerName} · {loan.id}
      </p>

      {!win.allowed && (
        <div className="mb-4 rounded-2xl bg-warn-soft p-3.5 text-sm text-warn">
          {win.reason === "after_7pm" ? (
            <>
              <p className="font-medium">{t("outcome.lateTitle")}</p>
              <input
                type="time"
                min="08:00"
                max="18:59"
                value={lateTime}
                onChange={(e) => setLateTime(e.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-warn/30 bg-white px-3 text-ink"
                aria-label={t("outcome.lateTitle")}
              />
              <p className="mt-1.5 text-xs">{t("outcome.lateHint")}</p>
            </>
          ) : (
            <p>{t("window.blocked.body")}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {tiles.map(({ k, icon, tone }) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setNote(null);
            }}
            aria-pressed={kind === k}
            className={`flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border text-[15px] font-medium transition-colors ${
              kind === k ? "border-ink bg-ink text-white" : "border-line bg-white hover:bg-surface"
            }`}
          >
            <span className={kind === k ? "text-white" : tone}>{icon}</span>
            {t(`outcome.${k}`)}
          </button>
        ))}
      </div>

      {kind && (
        <div className="animate-fade mt-5 space-y-4">
          {kind === "promise" && (
            <div>
              <p className="mb-2 text-sm font-medium">{t("outcome.when")}</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  [1, "outcome.tomorrow"],
                  [2, "outcome.dayAfter"],
                  [3, "outcome.in3"],
                  [7, "outcome.in7"],
                ].map(([d, key]) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(d as number)}
                    aria-pressed={days === d}
                    className={`h-12 rounded-xl border text-sm ${days === d ? "border-ink bg-ink text-white" : "border-line"}`}
                  >
                    {t(key as string)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {needsAmount && (
            <label className="block">
              <span className="text-sm font-medium">{t("outcome.amount")}</span>
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="num mt-1.5 h-12 w-full rounded-xl border border-line px-3.5 text-lg outline-none focus:border-accent"
              />
              <span className="mt-1 block text-xs text-muted">
                {t("loan.overdue")}: {inr(loan.overdueAmount)}
              </span>
            </label>
          )}
          {NOTES[kind].length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">{t("outcome.note")}</p>
              <div className="flex flex-wrap gap-2">
                {NOTES[kind].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNote(note === n ? null : n)}
                    aria-pressed={note === n}
                    className={`h-10 rounded-full border px-4 text-sm ${note === n ? "border-ink bg-ink text-white" : "border-line"}`}
                  >
                    {t(`outcome.note.${n}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-5 flex items-center gap-1.5 text-xs text-muted">
        <IconPin className="size-3.5" />
        {gps === null ? t("outcome.gps.getting") : gps.status === "ok" ? t("outcome.gps.ok", { m: gps.accuracy ?? 0 }) : t("outcome.gps.failed")}
      </p>

      <Button variant="primary" size="lg" className="mt-3 w-full" disabled={!canSave} onClick={save}>
        <IconCheck />
        {t("outcome.save")}
      </Button>
    </Sheet>
  );
}
