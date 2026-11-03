import Anthropic from "@anthropic-ai/sdk";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import type { DB } from "@/db/client";
import { contactAttempts, loans, messages, promises, users } from "@/db/schema";
import { checkContactWindow } from "@/domain/contactWindow";
import { checkDraft, fillTemplate, templateText, type TemplateId, type TemplateVars } from "@/domain/messages";
import { reminderDue } from "@/domain/promises";
import { addDays, istDate, istInstant } from "@/domain/time";
import { BRANCHES } from "./demo/reference";
import { exportOverdueFile } from "./mockLoanSystem";
import { importOverdueFile, latestImportDate, settlePromises } from "./imports";
import { ApiError } from "./auth";
import type { Session } from "@/lib/sessionToken";

type Loan = typeof loans.$inferSelect;

async function loanForOfficer(db: DB, session: Session, loanId: string): Promise<Loan> {
  const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
  if (!loan) throw new ApiError(404, "not_found");
  if (session.role === "officer" && loan.assignedOfficerId !== session.sub) throw new ApiError(403, "forbidden");
  if (session.role === "manager" && loan.branchId !== session.branchId) throw new ApiError(403, "forbidden");
  return loan;
}

/**
 * Which templates are true for this loan today. A "due tomorrow" message for a promise due today
 * would state a wrong date to the borrower, so each promise template is only offered when it fits.
 */
async function templatesFor(db: DB, loan: Loan, today: string): Promise<{ id: TemplateId; vars: TemplateVars }[]> {
  const [p] = await db
    .select()
    .from(promises)
    .where(and(eq(promises.loanId, loan.id), inArray(promises.status, ["open", "broken", "kept"])))
    .orderBy(desc(promises.createdAt))
    .limit(1);
  const branchPhone = BRANCHES.find((b) => b.id === loan.branchId)?.phone ?? "";
  const base = { name: loan.borrowerName, loanId: loan.id, branchPhone };
  const out: { id: TemplateId; vars: TemplateVars }[] = [];
  if (p?.status === "open" && p.promisedDate === addDays(today, 1)) out.push({ id: "ptp_day_before", vars: { ...base, amount: p.amount, date: p.promisedDate } });
  if (p?.status === "open" && p.promisedDate === today) out.push({ id: "ptp_due_today", vars: { ...base, amount: p.amount, date: p.promisedDate } });
  if (p?.status === "broken" && p.promisedDate >= addDays(today, -14)) out.push({ id: "broken_followup", vars: { ...base, amount: p.amount, date: p.promisedDate } });
  out.push({ id: "overdue_gentle", vars: { ...base, amount: loan.overdueAmount } });
  return out;
}

function sign(loanId: string, templateId: string, body: string): string {
  const key = process.env.SESSION_SECRET ?? "local-development-only-session-key";
  return createHmac("sha256", key).update(`${loanId}\n${templateId}\n${body}`).digest("base64url");
}

export type Draft = {
  templateId: TemplateId;
  options: TemplateId[];
  language: "hi" | "en";
  template: { body: string; token: string };
  ai: { body: string; token: string } | null;
  aiStatus: "ok" | "rejected" | "off" | "error";
  aiProblems?: string[];
};

/**
 * Drafts a reminder. The approved template is always produced. If an API key is configured,
 * Claude may rephrase it more personally; the rephrasing goes through the same checks as any
 * draft (no threats, same amount and date, no links) and is dropped if it fails. Each draft is
 * signed so the send endpoint only ever sends text this endpoint produced.
 */
export async function draftReminder(db: DB, session: Session, loanId: string, now: Date, requested?: TemplateId): Promise<Draft> {
  const loan = await loanForOfficer(db, session, loanId);
  const today = istDate(now);
  const options = await templatesFor(db, loan, today);
  const chosen = (requested && options.find((o) => o.id === requested)) || options[0];
  if (requested && chosen.id !== requested) throw new ApiError(400, "template_not_applicable");
  const { id: templateId, vars } = chosen;
  const lang = loan.language;
  const body = fillTemplate(templateId, lang, vars);
  const draft: Draft = {
    templateId,
    options: options.map((o) => o.id),
    language: lang,
    template: { body, token: sign(loan.id, templateId, body) },
    ai: null,
    aiStatus: "off",
  };

  if (!process.env.ANTHROPIC_API_KEY) return draft;
  try {
    const text = await personalise(templateText(templateId, lang), body, lang, loan);
    const check = checkDraft(text, vars, lang);
    if (check.ok) {
      draft.ai = { body: text, token: sign(loan.id, templateId, text) };
      draft.aiStatus = "ok";
    } else {
      draft.aiStatus = "rejected";
      draft.aiProblems = check.problems;
    }
  } catch (err) {
    console.error("draft personalisation failed", err instanceof Error ? err.message : err);
    draft.aiStatus = "error";
  }
  return draft;
}

let client: Anthropic | null = null;

async function personalise(approved: string, filled: string, lang: "hi" | "en", loan: Loan): Promise<string> {
  client ??= new Anthropic({ timeout: 15_000, maxRetries: 1 });
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system:
      "You rewrite payment reminders for an Indian NBFC so they read warmly and naturally for a small business owner. " +
      "Rules: keep every fact exactly (name, loan ID, rupee amount written the same way, date, phone number). Add no new facts, numbers, links or deadlines. " +
      "Be polite and respectful. Never threaten, pressure, mention legal steps, police, family, neighbours, consequences or warnings. " +
      `Write in ${lang === "hi" ? "simple Hindi (Devanagari)" : "simple Indian English"}, at most 300 characters. Reply with the message text only.`,
    messages: [
      {
        role: "user",
        content: `Approved template:\n${approved}\n\nFilled-in version to rewrite:\n${filled}\n\nBusiness type: ${loan.businessType}.`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("refused");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  if (!text) throw new Error("empty");
  return text.replace(/^["“]|["”]$/g, "");
}

/** Sends a drafted reminder (mock SMS gateway). Blocked and recorded outside 8 am to 7 pm. */
export async function sendReminder(
  db: DB,
  session: Session,
  input: { loanId: string; templateId: TemplateId; body: string; token: string; source: "ai" | "template" },
  now: Date,
) {
  const loan = await loanForOfficer(db, session, input.loanId);
  const expected = Buffer.from(sign(loan.id, input.templateId, input.body));
  const given = Buffer.from(input.token);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new ApiError(400, "draft_not_recognised");

  const w = checkContactWindow(now);
  const id = randomUUID();
  await db.insert(contactAttempts).values({
    id,
    loanId: loan.id,
    officerId: session.sub,
    channel: "message",
    at: now,
    allowed: w.allowed,
    blockReason: w.allowed ? null : w.reason,
  });
  await db.insert(messages).values({
    id,
    loanId: loan.id,
    recipient: "borrower",
    channel: "sms",
    language: loan.language,
    templateId: input.templateId,
    body: input.body,
    status: w.allowed ? "sent" : "blocked",
    blockReason: w.allowed ? null : w.reason,
    source: input.source,
    sentAt: w.allowed ? now : null,
    createdBy: session.sub,
  });
  return { status: w.allowed ? ("sent" as const) : ("blocked" as const), reason: w.allowed ? null : w.reason };
}

/**
 * The morning job (Vercel Cron at 9:00 IST, or "Run now" for a manager):
 * pull the day's file if it has not been imported, settle promises, and queue promise reminders
 * to borrowers (SMS, day before and on the day) and to officers (in-app). Messages created outside
 * 8 am to 7 pm are scheduled for 9 am instead of sent.
 */
export async function runDailyJobs(db: DB, now: Date) {
  const today = istDate(now);
  const summary = { imported: false as boolean | string, kept: 0, broken: 0, borrowerReminders: 0, officerReminders: 0, released: 0 };

  const latest = await latestImportDate(db);
  if (!latest || latest < today) {
    const file = await exportOverdueFile(db, today);
    const r = await importOverdueFile(db, { csv: file.csv, fileName: `lms_overdue_${today.replace(/-/g, "")}.csv`, asOfDate: today, userId: null, now });
    summary.imported = r.ok ? true : r.error;
  }
  const settled = await settlePromises(db, today, now);
  summary.kept = settled.kept;
  summary.broken = settled.broken;

  const w = checkContactWindow(now);
  const sendAt = w.allowed ? now : istInstant(w.opensAt > now ? istDate(w.opensAt) : today, 9);
  const open = await db.select().from(promises).where(eq(promises.status, "open"));
  const due = open.map((p) => ({ p, kind: reminderDue(p.promisedDate, today) })).filter((x) => x.kind);
  if (due.length) {
    const ls = new Map((await db.select().from(loans).where(inArray(loans.id, due.map((d) => d.p.loanId)))).map((l) => [l.id, l]));
    const already = new Set(
      (await db.select({ promiseId: messages.promiseId, templateId: messages.templateId }).from(messages).where(inArray(messages.promiseId, due.map((d) => d.p.id)))).map(
        (m) => `${m.promiseId}|${m.templateId}`,
      ),
    );
    for (const { p, kind } of due) {
      const loan = ls.get(p.loanId);
      if (!loan || loan.status !== "overdue") continue;
      const templateId: TemplateId = kind === "day_before" ? "ptp_day_before" : "ptp_due_today";
      if (!already.has(`${p.id}|${templateId}`)) {
        const vars = { name: loan.borrowerName, loanId: loan.id, amount: p.amount, date: p.promisedDate, branchPhone: BRANCHES.find((b) => b.id === loan.branchId)?.phone ?? "" };
        await db.insert(messages).values({
          id: randomUUID(),
          loanId: loan.id,
          promiseId: p.id,
          recipient: "borrower",
          channel: "sms",
          language: loan.language,
          templateId,
          body: fillTemplate(templateId, loan.language, vars),
          status: w.allowed ? "sent" : "scheduled",
          source: "system",
          scheduledFor: sendAt,
          sentAt: w.allowed ? now : null,
        });
        summary.borrowerReminders++;
      }
      if (kind === "due_today" && loan.assignedOfficerId && !already.has(`${p.id}|officer_ptp_today`)) {
        const [officer] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, loan.assignedOfficerId));
        await db.insert(messages).values({
          id: randomUUID(),
          loanId: loan.id,
          promiseId: p.id,
          recipient: "officer",
          channel: "in_app",
          language: officer?.locale ?? "hi",
          templateId: "officer_ptp_today",
          body: fillTemplate("officer_ptp_today", officer?.locale ?? "hi", { name: loan.borrowerName, loanId: loan.id, amount: p.amount, branchPhone: "" }),
          status: "sent",
          source: "system",
          sentAt: now,
        });
        summary.officerReminders++;
      }
    }
  }

  if (w.allowed) {
    const released = await db
      .update(messages)
      .set({ status: "sent", sentAt: now })
      .where(and(eq(messages.status, "scheduled"), lte(messages.scheduledFor, now)))
      .returning({ id: messages.id });
    summary.released = released.length;
  }
  return summary;
}
