import { describe, expect, it } from "vitest";
import { assignLoans, type OfficerSlot } from "@/domain/assignment";

const officers: OfficerSlot[] = [
  { id: "rahul", branchId: "SYG", pincodes: ["452002", "452007"], maxLoad: 3, active: true },
  { id: "neha", branchId: "SYG", pincodes: ["452007", "452004"], maxLoad: 3, active: true },
  { id: "imran", branchId: "PTM", pincodes: ["454775"], maxLoad: 2, active: true },
];
const loan = (id: string, pincode: string, branchId = "SYG", currentOfficerId: string | null = null, score = 50) => ({
  id,
  pincode,
  branchId,
  currentOfficerId,
  score,
});

describe("auto-assignment by pincode and workload", () => {
  it("only assigns within the officer's territory when possible", () => {
    const r = assignLoans([loan("L1", "452002"), loan("L2", "452004")], officers);
    expect(r.get("L1")).toEqual({ officerId: "rahul", note: "territory" });
    expect(r.get("L2")).toEqual({ officerId: "neha", note: "territory" });
  });

  it("balances a shared pincode across officers", () => {
    const r = assignLoans([loan("L1", "452007"), loan("L2", "452007"), loan("L3", "452007"), loan("L4", "452007")], officers);
    const counts = [...r.values()].reduce<Record<string, number>>((m, a) => ({ ...m, [a.officerId!]: (m[a.officerId!] ?? 0) + 1 }), {});
    expect(counts).toEqual({ rahul: 2, neha: 2 });
  });

  it("keeps a loan with its current officer for continuity", () => {
    const r = assignLoans([loan("L1", "452007", "SYG", "neha")], officers);
    expect(r.get("L1")).toEqual({ officerId: "neha", note: "kept" });
  });

  it("moves a loan when its officer is inactive", () => {
    const r = assignLoans([loan("L1", "452007", "SYG", "neha")], [officers[0], { ...officers[1], active: false }]);
    expect(r.get("L1")).toEqual({ officerId: "rahul", note: "territory" });
  });

  it("overflows to the branch and then over capacity, never leaving loans unworked", () => {
    const many = Array.from({ length: 8 }, (_, i) => loan(`L${i}`, "452002", "SYG", null, 100 - i));
    const r = assignLoans(many, officers);
    const notes = [...r.values()].map((a) => a.note);
    expect(notes.filter((n) => n === "territory")).toHaveLength(3); // rahul's cap
    expect(notes.filter((n) => n === "outside_territory")).toHaveLength(3); // neha has room
    expect(notes.filter((n) => n === "over_capacity")).toHaveLength(2);
    // highest scores get the territory officer
    expect(r.get("L0")?.note).toBe("territory");
  });

  it("flags loans in a branch with no officers", () => {
    const r = assignLoans([loan("L1", "455001", "DWS")], officers);
    expect(r.get("L1")).toEqual({ officerId: null, note: "no_officer" });
  });
});
