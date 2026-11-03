import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import { auditLog, contactAttempts, loans, outcomes, promises, users } from "@/db/schema";
import { checkContactWindow, checkReportedContactTime } from "@/domain/contactWindow";
import { distanceMeters, VISIT_RADIUS_M } from "@/domain/geo";
import { evaluatePromise } from "@/domain/promises";
import { parseEvents, type EventResult, type SyncEvent } from "@/domain/sync";
import { istDate } from "@/domain/time";
import type { Session } from "@/lib/sessionToken";

/**
 * Applies a batch of events queued on an officer's phone (possibly hours offline).
 * Idempotent: every event carries a UUID made on the phone, so a retry after a dropped
 * connection returns "duplicate" instead of logging the visit twice.
 */
export async function applySyncBatch(db: DB, session: Session, raw: unknown[], receivedAt: Date): Promise<EventResult[]> {
  const { valid, invalid } = parseEvents(raw);
  const results: EventResult[] = [...invalid];
  if (!valid.length) return results;

  const loanIds = [...new Set(valid.map((e) => e.loanId))];
  const loanRows = new Map((await db.select().from(loans).where(inArray(loans.id, loanIds))).map((l) => [l.id, l]));
  const [me] = await db.select().from(users).where(eq(users.id, session.sub));

  for (const e of valid) {
    const loan = loanRows.get(e.loanId);
    if (!loan) {
      results.push({ id: e.id, status: "rejected", reason: "unknown_loan" });
      continue;
    }
    // An officer can only log against loans in their branch. A loan reassigned since the phone
    // last synced is still accepted (the visit happened) but flagged for the manager.
    if (loan.branchId !== me.branchId) {
      results.push({ id: e.id, status: "rejected", reason: "not_your_branch" });
      continue;
    }
    const flags = loan.assignedOfficerId !== session.sub ? ["reassigned_since"] : [];
    try {
      results.push(e.kind === "attempt" ? await applyAttempt(db, session, e, receivedAt) : await applyOutcome(db, session, e, loan, receivedAt, flags));
    } catch (err) {
      console.error("sync event failed", e.id, err);
      results.push({ id: e.id, status: "rejected", reason: "server_error" });
    }
  }
  await db.update(users).set({ lastSyncAt: receivedAt }).where(eq(users.id, session.sub));
  return results;
}

async function applyAttempt(db: DB, session: Session, e: Extract<SyncEvent, { kind: "attempt" }>, receivedAt: Date): Promise<EventResult> {
  const [dup] = await db.select({ id: contactAttempts.id }).from(contactAttempts).where(eq(contactAttempts.id, e.id));
  if (dup) return { id: e.id, status: "duplicate" };
  const at = new Date(e.at);
  // The server decides whether it was allowed; the phone's claim is ignored.
  const w = checkContactWindow(at);
  const future = at.getTime() - receivedAt.getTime() > 10 * 60_000;
  await db.insert(contactAttempts).values({
    id: e.id,
    loanId: e.loanId,
    officerId: session.sub,
    channel: e.channel,
    at: future ? receivedAt : at,
    allowed: w.allowed && !future,
    blockReason: future ? "clock_in_future" : w.allowed ? null : w.reason,
    viaSync: true,
  });
  return { id: e.id, status: "accepted", flags: future ? ["device_clock_suspect"] : undefined };
}

async function applyOutcome(
  db: DB,
  session: Session,
  e: Extract<SyncEvent, { kind: "outcome" }>,
  loan: typeof loans.$inferSelect,
  receivedAt: Date,
  baseFlags: string[],
): Promise<EventResult> {
  const [dup] = await db.select({ id: outcomes.id }).from(outcomes).where(eq(outcomes.id, e.id));
  if (dup) return { id: e.id, status: "duplicate" };

  const occurredAt = new Date(e.occurredAt);
  const capturedAt = new Date(e.capturedAt);
  const check = checkReportedContactTime(occurredAt, capturedAt, receivedAt);
  if (!check.ok) {
    // Record the attempt so a contact outside 8 am to 7 pm is never silent.
    await db
      .insert(contactAttempts)
      .values({ id: e.id, loanId: e.loanId, officerId: session.sub, channel: "visit", at: occurredAt, allowed: false, blockReason: check.reason, viaSync: true })
      .onConflictDoNothing();
    return { id: e.id, status: "rejected", reason: check.reason };
  }

  const flags = [...baseFlags, ...check.flags];
  let distanceM: number | null = null;
  if (e.gps.status === "ok" && e.gps.lat !== undefined && e.gps.lng !== undefined && loan.lat !== null && loan.lng !== null) {
    distanceM = distanceMeters({ lat: e.gps.lat, lng: e.gps.lng }, { lat: loan.lat, lng: loan.lng });
    if (distanceM > VISIT_RADIUS_M) flags.push("far_from_borrower");
  } else if (e.gps.status !== "ok") flags.push("no_gps");

  if (e.type === "promise" && e.promisedDate! < istDate(occurredAt)) {
    return { id: e.id, status: "rejected", reason: "promise_in_past" };
  }

  await db.transaction(async (tx) => {
    await tx.insert(outcomes).values({
      id: e.id,
      loanId: e.loanId,
      officerId: session.sub,
      type: e.type,
      amount: e.type === "promise" || e.type === "paid" ? e.amount ?? null : null,
      note: e.note ?? null,
      occurredAt,
      capturedAt,
      receivedAt,
      lat: e.gps.lat ?? null,
      lng: e.gps.lng ?? null,
      accuracyM: e.gps.accuracy ?? null,
      gpsStatus: e.gps.status,
      distanceM,
      lateEntry: flags.includes("late_entry"),
      flags,
    });
    await tx
      .insert(contactAttempts)
      .values({ id: e.id, loanId: e.loanId, officerId: session.sub, channel: "visit", at: occurredAt, allowed: true, viaSync: true })
      .onConflictDoNothing();

    if (e.type === "promise") {
      // A new promise replaces any still-open one: the borrower has re-committed.
      await tx
        .update(promises)
        .set({ status: "superseded", resolvedAt: receivedAt })
        .where(and(eq(promises.loanId, e.loanId), eq(promises.status, "open")));
      await tx.insert(promises).values({
        id: `p-${e.id}`,
        loanId: e.loanId,
        officerId: session.sub,
        outcomeId: e.id,
        promisedDate: e.promisedDate!,
        amount: e.amount!,
        status: "open",
        createdAt: capturedAt,
      });
    }

    if (e.type === "paid") {
      const open = await tx.select().from(promises).where(and(eq(promises.loanId, e.loanId), eq(promises.status, "open")));
      for (const p of open) {
        const status = evaluatePromise(
          { promisedDate: p.promisedDate, amount: p.amount, createdAt: p.createdAt, status: p.status },
          { loanStatus: loan.status, lastPaymentDate: loan.lastPaymentDate, lastPaymentAmount: loan.lastPaymentAmount, paidOutcomes: [{ occurredAt, amount: e.amount ?? 0 }] },
          istDate(receivedAt),
        );
        if (status === "kept") await tx.update(promises).set({ status, resolvedAt: receivedAt }).where(eq(promises.id, p.id));
      }
    }
    await tx.insert(auditLog).values({ userId: session.sub, action: `outcome.${e.type}`, entity: "loans", entityId: e.loanId, meta: { outcomeId: e.id, flags } });
  });

  return { id: e.id, status: "accepted", flags };
}
