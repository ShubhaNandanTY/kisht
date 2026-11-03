"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Spinner } from "@/components/ui";

export function Retrain() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/manager/model/retrain", { method: "POST" });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(d.error === "not_enough_history" ? "Not enough history to train." : "Retraining failed.");
    setMsg(
      d.activated
        ? `New model live: AUC ${d.metrics.auc?.toFixed(3)} (was ${d.previousAuc?.toFixed(3) ?? "–"}). Lists re-scored.`
        : `Kept the current model: the new one scored ${d.metrics.auc?.toFixed(3)} vs ${d.previousAuc?.toFixed(3)}.`,
    );
    router.refresh();
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={run} disabled={busy}>
        {busy && <Spinner />}
        Retrain now
      </Button>
      {msg && <p className="max-w-xs text-right text-xs text-muted">{msg}</p>}
    </div>
  );
}
