import { z } from "zod";
import { isIsoDate } from "./time";

const iso = z.string().datetime({ offset: true });
const gps = z.object({
  status: z.enum(["ok", "denied", "unavailable", "timeout"]),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).max(100_000).optional(),
});

export const outcomeEvent = z
  .object({
    kind: z.literal("outcome"),
    id: z.string().uuid(),
    loanId: z.string().regex(/^LN-\d{4,8}$/),
    type: z.enum(["paid", "promise", "not_reachable", "dispute"]),
    amount: z.number().int().positive().max(100_000_000).optional(),
    promisedDate: z.string().refine(isIsoDate).optional(),
    note: z.string().trim().max(500).optional(),
    occurredAt: iso,
    capturedAt: iso,
    gps,
  })
  .superRefine((e, ctx) => {
    if (e.type === "promise" && (!e.promisedDate || !e.amount)) {
      ctx.addIssue({ code: "custom", message: "promise needs a date and an amount", path: ["promisedDate"] });
    }
    if (e.type === "paid" && !e.amount) ctx.addIssue({ code: "custom", message: "payment needs an amount", path: ["amount"] });
  });

export const attemptEvent = z.object({
  kind: z.literal("attempt"),
  id: z.string().uuid(),
  loanId: z.string().regex(/^LN-\d{4,8}$/),
  channel: z.enum(["call", "message"]),
  at: iso,
  allowed: z.boolean(),
  blockReason: z.string().max(40).optional(),
});


export const syncBatch = z.object({ events: z.array(z.unknown()).max(200) });

export type OutcomeEvent = z.infer<typeof outcomeEvent>;
export type AttemptEvent = z.infer<typeof attemptEvent>;
export type SyncEvent = OutcomeEvent | AttemptEvent;

export type EventResult =
  | { id: string; status: "accepted" | "duplicate"; flags?: string[] }
  | { id: string; status: "rejected"; reason: string };

/** Validates each queued event on its own, so one corrupt record does not block the rest of the queue. */
export function parseEvents(raw: unknown[]): { valid: SyncEvent[]; invalid: EventResult[] } {
  const valid: SyncEvent[] = [];
  const invalid: EventResult[] = [];
  for (const item of raw) {
    const id = typeof item === "object" && item && "id" in item ? String((item as { id: unknown }).id) : "unknown";
    const kind = typeof item === "object" && item && "kind" in item ? (item as { kind: unknown }).kind : undefined;
    const res = kind === "attempt" ? attemptEvent.safeParse(item) : outcomeEvent.safeParse(item);
    if (res.success) valid.push(res.data);
    else invalid.push({ id, status: "rejected", reason: `invalid:${res.error.issues[0]?.path.join(".")}` });
  }
  return { valid, invalid };
}
