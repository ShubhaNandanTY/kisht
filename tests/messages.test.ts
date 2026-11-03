import { describe, expect, it } from "vitest";
import { checkDraft, fillTemplate, findBlockedTerms, type TemplateId } from "@/domain/messages";

const vars = { name: "Company B", loanId: "LN-10293", amount: 29000, date: "2026-11-05", branchPhone: "0731-4000001" };

describe("approved templates", () => {
  const ids: TemplateId[] = ["ptp_day_before", "ptp_due_today", "overdue_gentle", "broken_followup"];
  for (const id of ids) {
    for (const lang of ["hi", "en"] as const) {
      it(`${id} (${lang}) passes its own safety check`, () => {
        const text = fillTemplate(id, lang, { ...vars, date: id === "overdue_gentle" ? undefined : vars.date });
        expect(text).toContain("29,000");
        expect(checkDraft(text, { ...vars, date: id === "overdue_gentle" ? undefined : vars.date }, lang)).toEqual({ ok: true });
      });
    }
  }
});

describe("threatening language filter", () => {
  it("blocks English threats without false positives on ordinary words", () => {
    expect(findBlockedTerms("We will take legal action and inform your family")).toEqual(["legal action", "family"]);
    expect(findBlockedTerms("Police will visit")).toEqual(["police"]);
    expect(findBlockedTerms("Thank you for your courtesy, the firm is reinforced")).toEqual([]);
  });

  it("blocks Hindi threats, with or without the nukta", () => {
    expect(findBlockedTerms("वरना पुलिस आएगी")).toEqual(expect.arrayContaining(["पुलिस", "वरना"]));
    expect(findBlockedTerms("आपका सामान ज़ब्त होगा")).toEqual(["जब्त"]);
    expect(findBlockedTerms("कृपया भुगतान करें")).toEqual([]);
  });
});

describe("AI draft checks", () => {
  const ok = "Namaste Company B, gentle reminder that ₹29,000 for loan LN-10293 is due on 5 November. Call 0731-4000001 for help.";

  it("accepts a faithful rephrasing", () => {
    expect(checkDraft(ok, vars, "en")).toEqual({ ok: true });
  });

  it("rejects a changed amount, a changed date, a link, a new phone number or a missing loan ID", () => {
    const fail = (t: string) => (checkDraft(t, vars, "en") as { ok: false; problems: string[] }).problems;
    expect(fail(ok.replace("29,000", "30,000"))).toContain("wrong_amount");
    expect(fail(ok.replace("5 November", "6 November"))).toContain("missing_or_changed_date");
    expect(fail(ok + " Pay at https://pay.example.com")).toContain("contains_link");
    expect(fail(ok.replace("0731-4000001", "98765 43210"))).toContain("unknown_phone_number");
    expect(fail(ok.replace("LN-10293", "your loan"))).toContain("missing_loan_id");
    expect(fail(ok + " Final warning.")).toEqual(["blocked_terms:final warning"]);
  });
});
