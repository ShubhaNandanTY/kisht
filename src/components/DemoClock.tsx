"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Demo only (DEMO_MODE=true): lets a reviewer try the app as if it were 10:30 am or 7:30 pm IST,
 * to see the contact block without waiting. The server applies the same shift.
 */
export function DemoClock({ onChange }: { onChange?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const set = async (istTime: string | null) => {
    setBusy(istTime ?? "real");
    await fetch("/api/demo/clock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ istTime }) });
    setBusy(null);
    onChange?.();
    router.refresh();
  };
  return (
    <div className="rounded-2xl border border-dashed border-line p-3">
      <p className="text-xs font-medium text-muted">Demo clock (IST)</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {[
          [null, "Real time"],
          ["10:30", "10:30 am"],
          ["19:30", "7:30 pm"],
        ].map(([v, label]) => (
          <button key={label} onClick={() => set(v)} disabled={!!busy} className="h-10 rounded-xl border border-line text-sm hover:bg-surface disabled:opacity-50">
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
