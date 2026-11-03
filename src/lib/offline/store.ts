"use client";

import { openDB, type IDBPDatabase } from "idb";
import type { SyncEvent } from "@/domain/sync";
import type { OfficerPayload } from "@/server/officer";

export type OutboxItem = {
  id: string;
  officerId: string;
  event: SyncEvent;
  status: "pending" | "synced" | "rejected";
  reason?: string;
  flags?: string[];
  createdAt: number;
  tries: number;
};

type Schema = {
  kv: { key: string; value: { payload: OfficerPayload; savedAt: number } };
  outbox: { key: string; value: OutboxItem; indexes: { byOfficer: string } };
};

let dbp: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  dbp ??= openDB<Schema>("kisht", 1, {
    upgrade(d) {
      d.createObjectStore("kv");
      const o = d.createObjectStore("outbox", { keyPath: "id" });
      o.createIndex("byOfficer", "officerId");
    },
  });
  return dbp;
}

export async function savePayload(officerId: string, payload: OfficerPayload) {
  await (await db()).put("kv", { payload, savedAt: Date.now() }, `payload:${officerId}`);
}

export async function loadPayload(officerId: string) {
  return (await db()).get("kv", `payload:${officerId}`);
}

export async function enqueue(officerId: string, event: SyncEvent) {
  await (await db()).put("outbox", { id: event.id, officerId, event, status: "pending", createdAt: Date.now(), tries: 0 });
}

export async function outbox(officerId: string): Promise<OutboxItem[]> {
  const items = await (await db()).getAllFromIndex("outbox", "byOfficer", officerId);
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function updateItem(item: OutboxItem) {
  await (await db()).put("outbox", item);
}

/** Keep synced records for two days so "My day" can show them; drop older ones. */
export async function prune(officerId: string) {
  const d = await db();
  const cutoff = Date.now() - 2 * 86_400_000;
  for (const it of await d.getAllFromIndex("outbox", "byOfficer", officerId)) {
    if (it.status !== "pending" && it.createdAt < cutoff) await d.delete("outbox", it.id);
  }
}

/** On sign-out: borrower data must not stay on a shared or lost phone (DPDP). */
export async function wipe() {
  const d = await db();
  await d.clear("kv");
  await d.clear("outbox");
}
