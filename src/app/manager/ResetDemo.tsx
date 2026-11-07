"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui";

export function ResetDemo() {
  const [busy, setBusy] = useState(false);
  async function reset() {
    if (!confirm("Rebuild all demo data as of today? Everything logged so far is replaced. Takes up to a minute.")) return;
    setBusy(true);
    const r = await fetch("/api/manager/demo-reset", { method: "POST" });
    setBusy(false);
    if (!r.ok) return alert("Reset failed. Try again.");
    window.location.href = "/manager";
  }
  return (
    <button onClick={reset} disabled={busy} className="flex items-center gap-2 text-sm text-muted hover:text-ink disabled:opacity-60">
      {busy && <Spinner className="size-3.5" />}
      {busy ? "Rebuilding demo data…" : "Reset demo data"}
    </button>
  );
}
