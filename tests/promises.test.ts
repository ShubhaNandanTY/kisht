import { describe, expect, it } from "vitest";
import { evaluatePromise, reminderDue } from "@/domain/promises";
import { istInstant } from "@/domain/time";

const p = { promisedDate: "2026-10-31", amount: 22000, createdAt: istInstant("2026-10-27", 12), status: "open" as const };
const none = { loanStatus: "overdue" as const, lastPaymentDate: null, lastPaymentAmount: null, paidOutcomes: [] };

describe("promise to pay", () => {
  it("is open until the grace day passes, then broken (LN-11930 in the sample)", () => {
    expect(evaluatePromise(p, none, "2026-10-31")).toBe("open");
    expect(evaluatePromise(p, none, "2026-11-01")).toBe("open");
    expect(evaluatePromise(p, none, "2026-11-03")).toBe("broken");
  });

  it("is kept when the loan system shows enough payment in the window", () => {
    const ev = { ...none, lastPaymentDate: "2026-10-31", lastPaymentAmount: 20000 };
    expect(evaluatePromise(p, ev, "2026-11-03")).toBe("kept");
  });

  it("is not kept by a small part-payment", () => {
    const ev = { ...none, lastPaymentDate: "2026-10-31", lastPaymentAmount: 5000 };
    expect(evaluatePromise(p, ev, "2026-11-03")).toBe("broken");
  });

  it("is kept when the loan cures, or when the officer logged the payment", () => {
    expect(evaluatePromise(p, { ...none, loanStatus: "cured", curedOn: "2026-11-01" }, "2026-11-03")).toBe("kept");
    const logged = { ...none, paidOutcomes: [{ occurredAt: istInstant("2026-10-30", 14), amount: 22000 }] };
    expect(evaluatePromise(p, logged, "2026-11-03")).toBe("kept");
  });

  it("ignores payments made before the promise was given", () => {
    const ev = { ...none, lastPaymentDate: "2026-10-20", lastPaymentAmount: 22000 };
    expect(evaluatePromise(p, ev, "2026-11-03")).toBe("broken");
  });

  it("schedules reminders the day before and on the day", () => {
    expect(reminderDue("2026-11-05", "2026-11-04")).toBe("day_before");
    expect(reminderDue("2026-11-05", "2026-11-05")).toBe("due_today");
    expect(reminderDue("2026-11-05", "2026-11-03")).toBeNull();
  });
});
