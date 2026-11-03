// End-to-end server flows against a real (in-memory) Postgres: PGlite with the app's migrations.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The Claude call is mocked: tests control what "the model" replies.
const reply = vi.hoisted(() => ({ text: "" }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { create: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: reply.text }] }) } };
  },
}));
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { DB } from "@/db/client";
import { applySyncBatch } from "@/server/sync";
import { importOverdueFile } from "@/server/imports";
import { draftReminder, sendReminder } from "@/server/reminders";
import { CSV_COLUMNS, toCsv } from "@/domain/csv";
import { istInstant } from "@/domain/time";
import type { Session } from "@/lib/sessionToken";

const TODAY = "2026-11-03";
const at = (h: number, m = 0) => istInstant(TODAY, h, m);
const rahul: Session = { sub: "o-rahul", role: "officer", branchId: "SNR", name: "Rahul" };
const imran: Session = { sub: "o-imran", role: "officer", branchId: "SYG", name: "Imran" };
let db: DB;
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

function outcome(over: Record<string, unknown> = {}) {
  return {
    kind: "outcome",
    id: id(),
    loanId: "LN-10293",
    type: "promise",
    amount: 29000,
    promisedDate: "2026-11-05",
    occurredAt: at(11).toISOString(),
    capturedAt: at(11, 1).toISOString(),
    gps: { status: "ok", lat: 22.7643, lng: 75.8541, accuracy: 20 },
    ...over,
  };
}

function loanRow(i: number, over: Record<string, string | number | null> = {}) {
  return {
    loan_id: `LN-${20000 + i}`,
    borrower_name: `Test Borrower ${i}`,
    business_type: "Hardware store",
    phone: `90000${20000 + i}`,
    address: "Shop 1, Siyaganj, Indore",
    pincode: "452007",
    branch_code: "SYG",
    outstanding: 200000,
    overdue_amount: 9000,
    dpd: 5,
    emi_amount: 9000,
    last_payment_date: "2026-09-29",
    last_payment_amount: 9000,
    missed_emis_12m: 1,
    months_on_book: 20,
    language: "hi",
    lat: null,
    lng: null,
    ...over,
  };
}

beforeAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  db = drizzle(new PGlite(), { schema }) as unknown as DB;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await migrate(db as any, { migrationsFolder: "./drizzle" });
  await db.insert(schema.branches).values([
    { id: "SNR", name: "Sanwer Road", nameHi: "सांवेर रोड" },
    { id: "SYG", name: "Siyaganj", nameHi: "सियागंज" },
  ]);
  await db.insert(schema.users).values([
    { id: "o-rahul", name: "Rahul", email: "r@t", passwordHash: "x", role: "officer", branchId: "SNR", pincodes: ["452015"] },
    { id: "o-imran", name: "Imran", email: "i@t", passwordHash: "x", role: "officer", branchId: "SYG", pincodes: ["452007"] },
  ]);
  await db.insert(schema.loans).values({
    id: "LN-10293",
    borrowerName: "Company B",
    businessType: "Packaging unit",
    phone: "9000010293",
    address: "Sanwer Road",
    pincode: "452015",
    lat: 22.7643,
    lng: 75.8541,
    branchId: "SNR",
    emiAmount: 29000,
    outstanding: 640000,
    overdueAmount: 29000,
    dpd: 12,
    assignedOfficerId: "o-rahul",
  });
}, 30_000);

describe("offline sync", () => {
  it("accepts a promise once and treats the retry as a duplicate", async () => {
    const e = outcome();
    const first = await applySyncBatch(db, rahul, [e], at(15));
    const retry = await applySyncBatch(db, rahul, [e], at(15, 5));
    expect(first[0].status).toBe("accepted");
    expect(retry[0].status).toBe("duplicate");
    const rows = await db.select().from(schema.outcomes).where(eq(schema.outcomes.id, e.id as string));
    expect(rows).toHaveLength(1);
    const open = await db.select().from(schema.promises).where(and(eq(schema.promises.loanId, "LN-10293"), eq(schema.promises.status, "open")));
    expect(open.map((p) => p.promisedDate)).toEqual(["2026-11-05"]);
  });

  it("a new promise supersedes the open one", async () => {
    await applySyncBatch(db, rahul, [outcome({ promisedDate: "2026-11-07", occurredAt: at(12).toISOString(), capturedAt: at(12).toISOString() })], at(15));
    const ps = await db.select().from(schema.promises).where(eq(schema.promises.loanId, "LN-10293"));
    expect(ps.filter((p) => p.status === "open").map((p) => p.promisedDate)).toEqual(["2026-11-07"]);
    expect(ps.some((p) => p.status === "superseded")).toBe(true);
  });

  it("rejects a contact after 7 pm and records the attempt", async () => {
    const e = outcome({ type: "not_reachable", amount: undefined, promisedDate: undefined, occurredAt: at(19, 30).toISOString(), capturedAt: at(19, 31).toISOString() });
    const [r] = await applySyncBatch(db, rahul, [e], at(19, 40));
    expect(r).toMatchObject({ status: "rejected", reason: "outside_contact_hours" });
    const [att] = await db.select().from(schema.contactAttempts).where(eq(schema.contactAttempts.id, e.id as string));
    expect(att).toMatchObject({ allowed: false, blockReason: "outside_contact_hours" });
  });

  it("decides call attempts on the server, ignoring what the phone claims", async () => {
    const e = { kind: "attempt", id: id(), loanId: "LN-10293", channel: "call", at: at(20).toISOString(), allowed: true };
    await applySyncBatch(db, rahul, [e], at(20, 5));
    const [att] = await db.select().from(schema.contactAttempts).where(eq(schema.contactAttempts.id, e.id));
    expect(att).toMatchObject({ allowed: false, blockReason: "after_7pm" });
  });

  it("flags a visit logged far from the shop and keeps it", async () => {
    const e = outcome({ type: "not_reachable", amount: undefined, promisedDate: undefined, gps: { status: "ok", lat: 22.8, lng: 75.9, accuracy: 15 } });
    const [r] = await applySyncBatch(db, rahul, [e], at(15));
    expect(r).toMatchObject({ status: "accepted", flags: expect.arrayContaining(["far_from_borrower"]) });
  });

  it("refuses an officer logging against another branch's loan", async () => {
    const [r] = await applySyncBatch(db, imran, [outcome()], at(15));
    expect(r).toMatchObject({ status: "rejected", reason: "not_your_branch" });
  });
});

describe("daily import", () => {
  const file = (rows: ReturnType<typeof loanRow>[]) => toCsv(rows, CSV_COLUMNS);

  it("imports, scores and assigns by pincode", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => loanRow(i));
    const r = await importOverdueFile(db, { csv: file(rows), fileName: "a.csv", asOfDate: TODAY, userId: null, now: at(7) });
    expect(r).toMatchObject({ ok: true, imported: 30, newlyOverdue: 30 });
    const l = (await db.select().from(schema.loans).where(eq(schema.loans.id, "LN-20000")))[0];
    expect(l.assignedOfficerId).toBe("o-imran");
    expect(l.score).toBeGreaterThan(0);
    expect(l.reasons?.length).toBeGreaterThan(0);
  });

  it("refuses a file that would clear most lists, unless confirmed", async () => {
    const r = await importOverdueFile(db, { csv: file([loanRow(0)]), fileName: "b.csv", asOfDate: TODAY, userId: null, now: at(8) });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/^partial_file:1:/) });
  });

  it("marks missing loans as paid up and moves 90+ DPD to NPA", async () => {
    const rows = Array.from({ length: 29 }, (_, i) => loanRow(i, i === 1 ? { dpd: 95 } : {}));
    const r = await importOverdueFile(db, { csv: file(rows), fileName: "c.csv", asOfDate: TODAY, userId: null, now: at(9) });
    expect(r).toMatchObject({ ok: true, npa: 1 });
    const [cured] = await db.select().from(schema.loans).where(eq(schema.loans.id, "LN-20029"));
    const [npa] = await db.select().from(schema.loans).where(eq(schema.loans.id, "LN-20001"));
    expect(cured.status).toBe("cured");
    expect(npa).toMatchObject({ status: "npa", assignedOfficerId: null });
  });

  it("refuses to rewind to an older date", async () => {
    const r = await importOverdueFile(db, { csv: file([loanRow(0)]), fileName: "d.csv", asOfDate: "2026-11-01", userId: null, now: at(10) });
    expect(r).toMatchObject({ ok: false, error: "older_than_latest" });
  });
});

describe("reminders", () => {
  it("only sends text the draft endpoint produced, and blocks it after 7 pm", async () => {
    const d = await draftReminder(db, rahul, "LN-10293", at(11));
    expect(d.aiStatus).toBe("off"); // no API key in tests: approved template only
    expect(d.template.body).toContain("LN-10293");
    await expect(sendReminder(db, rahul, { loanId: "LN-10293", templateId: d.templateId, body: d.template.body + " Pay now or else.", token: d.template.token, source: "template" }, at(11))).rejects.toMatchObject({ code: "draft_not_recognised" });
    const ok = await sendReminder(db, rahul, { loanId: "LN-10293", templateId: d.templateId, body: d.template.body, token: d.template.token, source: "template" }, at(11));
    expect(ok.status).toBe("sent");
    const late = await sendReminder(db, rahul, { loanId: "LN-10293", templateId: d.templateId, body: d.template.body, token: d.template.token, source: "template" }, at(19, 15));
    expect(late).toMatchObject({ status: "blocked", reason: "after_7pm" });
  });

  it("refuses another officer's borrower", async () => {
    await expect(draftReminder(db, imran, "LN-10293", at(11))).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("AI-drafted reminders", () => {
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("uses a rewrite that keeps every fact and passes the filter", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    reply.text = "Namaste Company B, a gentle reminder that ₹29,000 is pending on loan LN-10293. Please call 0731-4000002 if you would like to talk.";
    const d = await draftReminder(db, rahul, "LN-10293", at(11), "overdue_gentle");
    expect(d.aiStatus).toBe("ok");
    expect(d.ai?.body).toBe(reply.text);
    const sent = await sendReminder(db, rahul, { loanId: "LN-10293", templateId: d.templateId, body: d.ai!.body, token: d.ai!.token, source: "ai" }, at(11));
    expect(sent.status).toBe("sent");
  });

  it("drops a threatening rewrite and falls back to the approved template", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    reply.text = "Company B, pay ₹29,000 on LN-10293 today or we will take legal action and inform your family.";
    const d = await draftReminder(db, rahul, "LN-10293", at(11), "overdue_gentle");
    expect(d.aiStatus).toBe("rejected");
    expect(d.ai).toBeNull();
    expect(d.aiProblems?.[0]).toMatch(/^blocked_terms:/);
    expect(d.template.body).toContain("Company B");
  });

  it("drops a rewrite that changes the amount", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    reply.text = "Namaste Company B, please pay ₹2,900 on loan LN-10293. Call 0731-4000002 for help.";
    const d = await draftReminder(db, rahul, "LN-10293", at(11), "overdue_gentle");
    expect(d).toMatchObject({ aiStatus: "rejected", ai: null, aiProblems: expect.arrayContaining(["wrong_amount"]) });
  });
});
