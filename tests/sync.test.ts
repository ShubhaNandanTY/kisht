import { describe, expect, it } from "vitest";
import { parseEvents } from "@/domain/sync";

const base = {
  kind: "outcome",
  id: "0b6f6a7e-8f7a-4c6e-9d9f-2a1b3c4d5e6f",
  loanId: "LN-10293",
  type: "promise",
  amount: 29000,
  promisedDate: "2026-11-05",
  occurredAt: "2026-11-03T11:00:00+05:30",
  capturedAt: "2026-11-03T11:00:05+05:30",
  gps: { status: "ok", lat: 22.75, lng: 75.86, accuracy: 30 },
};

describe("offline sync batch validation", () => {
  it("accepts valid outcome and attempt events", () => {
    const attempt = { kind: "attempt", id: "1b6f6a7e-8f7a-4c6e-9d9f-2a1b3c4d5e6f", loanId: "LN-10293", channel: "call", at: base.occurredAt, allowed: false, blockReason: "after_7pm" };
    const r = parseEvents([base, attempt]);
    expect(r.valid).toHaveLength(2);
    expect(r.invalid).toEqual([]);
  });

  it("rejects one bad event without blocking the others", () => {
    const r = parseEvents([base, { ...base, id: "not-a-uuid" }, { ...base, id: "2b6f6a7e-8f7a-4c6e-9d9f-2a1b3c4d5e6f", promisedDate: undefined }]);
    expect(r.valid).toHaveLength(1);
    expect(r.invalid.map((x) => x.status)).toEqual(["rejected", "rejected"]);
  });

  it("allows GPS to be missing when the phone could not get a fix", () => {
    const r = parseEvents([{ ...base, gps: { status: "timeout" } }]);
    expect(r.valid).toHaveLength(1);
  });
});
