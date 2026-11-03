import { describe, expect, it } from "vitest";
import { checkContactWindow, checkReportedContactTime } from "@/domain/contactWindow";
import { istInstant } from "@/domain/time";

const at = (h: number, m = 0, date = "2026-11-03") => istInstant(date, h, m);

describe("8 am to 7 pm contact window (IST)", () => {
  it("blocks before 8:00 and from 19:00, allows in between", () => {
    expect(checkContactWindow(at(7, 59)).allowed).toBe(false);
    expect(checkContactWindow(at(8, 0)).allowed).toBe(true);
    expect(checkContactWindow(at(18, 59)).allowed).toBe(true);
    expect(checkContactWindow(at(19, 0)).allowed).toBe(false);
  });

  it("uses IST regardless of the machine timezone", () => {
    // 02:30 UTC is 08:00 IST
    expect(checkContactWindow(new Date("2026-11-03T02:30:00Z")).allowed).toBe(true);
    expect(checkContactWindow(new Date("2026-11-03T02:29:00Z")).allowed).toBe(false);
  });

  it("says when the window reopens", () => {
    const late = checkContactWindow(at(21, 15));
    expect(late.allowed).toBe(false);
    if (!late.allowed) {
      expect(late.reason).toBe("after_7pm");
      expect(late.opensAt.toISOString()).toBe(at(8, 0, "2026-11-04").toISOString());
    }
    const early = checkContactWindow(at(6, 0));
    if (!early.allowed) expect(early.opensAt.toISOString()).toBe(at(8).toISOString());
  });
});

describe("contact times reported by a phone that was offline", () => {
  it("accepts a visit logged offline and synced hours later, and flags the late sync", () => {
    const r = checkReportedContactTime(at(11), at(11, 2), at(17));
    expect(r.ok).toBe(true);
    expect(r.flags).toContain("synced_late");
  });

  it("rejects a contact that happened outside the window", () => {
    const r = checkReportedContactTime(at(19, 30), at(19, 31), at(19, 32));
    expect(r).toMatchObject({ ok: false, reason: "outside_contact_hours" });
  });

  it("accepts an evening entry for a visit that happened in hours, flagged as late entry", () => {
    const r = checkReportedContactTime(at(18, 30), at(20, 15), at(20, 16));
    expect(r.ok).toBe(true);
    expect(r.flags).toContain("late_entry");
  });

  it("rejects a device clock running ahead of the server", () => {
    const r = checkReportedContactTime(at(15), at(15), at(12));
    expect(r).toMatchObject({ ok: false, reason: "clock_in_future" });
  });

  it("rejects records older than a week", () => {
    const r = checkReportedContactTime(at(10, 0, "2026-10-20"), at(10, 0, "2026-10-20"), at(10));
    expect(r).toMatchObject({ ok: false, reason: "too_old" });
  });
});
