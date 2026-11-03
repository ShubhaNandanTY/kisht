import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { auditLog, loans, users } from "@/db/schema";
import { ApiError, requireSession } from "@/server/auth";
import { json, route } from "@/server/http";

const body = z.object({ loanId: z.string().regex(/^LN-\d{4,8}$/), officerId: z.string().min(1).max(40) });

export const POST = route(async (req: Request) => {
  const s = await requireSession(["manager", "head"]);
  const { loanId, officerId } = body.parse(await req.json());
  const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
  const [officer] = await db.select().from(users).where(and(eq(users.id, officerId), eq(users.role, "officer"), eq(users.active, true)));
  if (!loan || !officer) throw new ApiError(404, "not_found");
  if (s.role === "manager" && (loan.branchId !== s.branchId || officer.branchId !== s.branchId)) throw new ApiError(403, "forbidden");
  if (officer.branchId !== loan.branchId) throw new ApiError(400, "different_branch");
  await db.update(loans).set({ assignedOfficerId: officerId, assignmentNote: "manager", managerRank: null }).where(eq(loans.id, loanId));
  await db.insert(auditLog).values({ userId: s.sub, action: "reassign", entity: "loans", entityId: loanId, meta: { from: loan.assignedOfficerId, to: officerId } });
  return json({ ok: true });
});
