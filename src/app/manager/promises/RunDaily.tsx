"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Spinner } from "@/components/ui";

/** Runs the 9 am job now (it also runs on Vercel Cron): import if needed, settle promises, send reminders. */
export function RunDaily() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/manager/daily", { method: "POST" });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg("Could not run the morning job.");
    setMsg(
      `${d.borrowerReminders} borrower and ${d.officerReminders} officer reminders created · ${d.kept} kept, ${d.broken} broken${d.released ? ` · ${d.released} scheduled sent` : ""}`,
    );
    router.refresh();
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={run} disabled={busy}>
        {busy && <Spinner />}
        Run morning job now
      </Button>
      {msg && <p className="max-w-sm text-right text-xs text-muted">{msg}</p>}
    </div>
  );
}
