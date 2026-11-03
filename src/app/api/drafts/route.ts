import { z } from "zod";
import { db } from "@/db/client";
import { requireSession, serverNow } from "@/server/auth";
import { json, route } from "@/server/http";
import { draftReminder } from "@/server/reminders";

const body = z.object({
  loanId: z.string().regex(/^LN-\d{4,8}$/),
  templateId: z.enum(["overdue_gentle", "ptp_day_before", "ptp_due_today", "broken_followup"]).optional(),
});

export const POST = route(async (req: Request) => {
  const s = await requireSession(["officer", "manager", "head"]);
  const { loanId, templateId } = body.parse(await req.json());
  return json(await draftReminder(db, s, loanId, await serverNow(), templateId));
});
