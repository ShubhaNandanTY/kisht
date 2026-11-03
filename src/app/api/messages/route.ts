import { z } from "zod";
import { db } from "@/db/client";
import { requireSession, serverNow } from "@/server/auth";
import { json, route } from "@/server/http";
import { sendReminder } from "@/server/reminders";

const body = z.object({
  loanId: z.string().regex(/^LN-\d{4,8}$/),
  templateId: z.enum(["overdue_gentle", "ptp_day_before", "ptp_due_today", "broken_followup"]),
  body: z.string().min(1).max(600),
  token: z.string().min(10).max(200),
  source: z.enum(["ai", "template"]),
});

export const POST = route(async (req: Request) => {
  const s = await requireSession(["officer"]);
  return json(await sendReminder(db, s, body.parse(await req.json()), await serverNow()));
});
