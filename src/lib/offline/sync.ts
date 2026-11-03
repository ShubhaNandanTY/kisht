"use client";

import type { EventResult } from "@/domain/sync";
import { outbox, updateItem } from "./store";

export type SyncState = { phase: "idle" | "syncing" | "offline" | "error" | "auth"; pending: number; lastSyncedAt: number | null };

let state: SyncState = { phase: "idle", pending: 0, lastSyncedAt: null };
const listeners = new Set<(s: SyncState) => void>();
let running = false;
let backoffMs = 5_000;
let timer: ReturnType<typeof setTimeout> | null = null;

function set(next: Partial<SyncState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l(state));
}

export function subscribe(fn: (s: SyncState) => void) {
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
}

export async function refreshCount(officerId: string) {
  const items = await outbox(officerId);
  set({ pending: items.filter((i) => i.status === "pending").length });
}

/**
 * Sends queued events in batches. Network errors back off (5 s doubling to 5 min); a 401 stops
 * until the officer signs in again; the queue is never dropped. Per-event results let one bad
 * record be marked "not accepted" without blocking the rest.
 */
export async function flush(officerId: string, onChange?: () => void): Promise<void> {
  if (running) return;
  running = true;
  try {
    const pending = (await outbox(officerId)).filter((i) => i.status === "pending");
    set({ pending: pending.length });
    if (!pending.length) {
      set({ phase: navigator.onLine ? "idle" : "offline" });
      return;
    }
    if (!navigator.onLine) {
      set({ phase: "offline" });
      return;
    }
    set({ phase: "syncing" });
    for (let i = 0; i < pending.length; i += 50) {
      const batch = pending.slice(i, i + 50);
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch.map((b) => b.event) }),
      });
      if (res.status === 401) {
        set({ phase: "auth" });
        return;
      }
      if (!res.ok) throw new Error(`sync ${res.status}`);
      const { results } = (await res.json()) as { results: EventResult[] };
      for (const item of batch) {
        const r = results.find((x) => x.id === item.id);
        if (!r) continue;
        item.tries++;
        if (r.status === "rejected") {
          item.status = "rejected";
          item.reason = r.reason;
        } else {
          item.status = "synced";
          item.flags = r.flags;
        }
        await updateItem(item);
      }
    }
    backoffMs = 5_000;
    set({ phase: "idle", lastSyncedAt: Date.now() });
    onChange?.();
  } catch {
    set({ phase: navigator.onLine ? "error" : "offline" });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => flush(officerId, onChange), backoffMs);
    backoffMs = Math.min(backoffMs * 2, 300_000);
  } finally {
    running = false;
    await refreshCount(officerId);
  }
}
