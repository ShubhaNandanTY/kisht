import { and, asc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { auditLog, loans } from "@/db/schema";
import { ApiError, requireSession } from "@/server/auth";
import { json, route } from "@/server/http";

const body = z.object({ loanId: z.string().regex(/^LN-\d{4,8}$/), action: z.enum(["pin", "up", "down", "clear"]) });

/**
 * Manager override of the model's order. Pinned loans sit above the scored list in the order
 * the manager set; "clear" hands the loan back to the score. Pins last until the next daily import.
 */
export const POST = route(async (req: Request) => {
  const s = await requireSession(["manager", "head"]);
  const { loanId, action } = body.parse(await req.json());
  const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
  if (!loan || !loan.assignedOfficerId) throw new ApiError(404, "not_found");
  if (s.role === "manager" && loan.branchId !== s.branchId) throw new ApiError(403, "forbidden");

  const pinned = await db
    .select({ id: loans.id, rank: loans.managerRank })
    .from(loans)
    .where(and(eq(loans.assignedOfficerId, loan.assignedOfficerId), eq(loans.status, "overdue"), isNotNull(loans.managerRank)))
    .orderBy(asc(loans.managerRank));
  let order = pinned.map((p) => p.id).filter((id) => id !== loanId);
  const idx = pinned.findIndex((p) => p.id === loanId);
  if (action === "pin") order = [...order, loanId];
  if (action === "up") order.splice(Math.max(idx === -1 ? order.length : idx - 1, 0), 0, loanId);
  if (action === "down") order.splice(idx === -1 ? order.length : Math.min(idx + 1, order.length), 0, loanId);

  await db.transaction(async (tx) => {
    await tx.update(loans).set({ managerRank: null }).where(and(eq(loans.assignedOfficerId, loan.assignedOfficerId!), isNotNull(loans.managerRank)));
    for (const [i, id] of order.entries()) await tx.update(loans).set({ managerRank: i + 1 }).where(eq(loans.id, id));
    await tx.insert(auditLog).values({ userId: s.sub, action: `reorder.${action}`, entity: "loans", entityId: loanId, meta: { officer: loan.assignedOfficerId } });
  });
  return json({ ok: true, pinned: order.length });
});
