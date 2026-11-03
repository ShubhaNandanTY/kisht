import { addDays, istDate } from "./time";
import type { PromiseStatus } from "@/db/schema";

/** A payment made on the promise date only shows up in the next morning's file, so allow one day. */
export const PROMISE_GRACE_DAYS = 1;
/** Paying 90% of the promised amount counts as keeping the promise. */
export const KEPT_THRESHOLD = 0.9;

export type PromiseLike = {
  promisedDate: string;
  amount: number;
  createdAt: Date;
  status: PromiseStatus;
};

export type PaymentEvidence = {
  loanStatus: "overdue" | "cured" | "npa";
  curedOn?: string | null; // file date on which the loan dropped out of the overdue list
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;
  paidOutcomes: { occurredAt: Date; amount: number | null }[]; // officer-reported payments
};

/**
 * Decides whether a promise to pay was kept, broken, or is still open.
 * Evidence, strongest first: the loan left the overdue list, the loan system shows a
 * payment of enough size in the promise window, or the officer logged a payment.
 */
export function evaluatePromise(p: PromiseLike, ev: PaymentEvidence, today: string): PromiseStatus {
  if (p.status === "superseded" || p.status === "kept") return p.status;
  const from = istDate(p.createdAt);
  const until = addDays(p.promisedDate, PROMISE_GRACE_DAYS);
  const need = p.amount * KEPT_THRESHOLD;

  if (ev.loanStatus === "cured" && (!ev.curedOn || (ev.curedOn >= from && ev.curedOn <= addDays(until, 1)))) return "kept";
  if (ev.lastPaymentDate && ev.lastPaymentDate >= from && ev.lastPaymentDate <= until && (ev.lastPaymentAmount ?? 0) >= need) {
    return "kept";
  }
  const reported = ev.paidOutcomes
    .filter((o) => istDate(o.occurredAt) >= from && istDate(o.occurredAt) <= until)
    .reduce((s, o) => s + (o.amount ?? 0), 0);
  if (reported >= need && reported > 0) return "kept";

  return today > until ? "broken" : "open";
}

/** Which reminder (if any) is due today for an open promise. */
export function reminderDue(promisedDate: string, today: string): "day_before" | "due_today" | null {
  if (addDays(today, 1) === promisedDate) return "day_before";
  if (today === promisedDate) return "due_today";
  return null;
}
