export type OfficerSlot = {
  id: string;
  branchId: string;
  pincodes: string[];
  maxLoad: number;
  active: boolean;
};

export type LoanToAssign = {
  id: string;
  branchId: string;
  pincode: string;
  currentOfficerId: string | null;
  score: number | null;
};

export type AssignmentNote = "kept" | "territory" | "outside_territory" | "over_capacity" | "no_officer";

export type Assignment = { officerId: string | null; note: AssignmentNote };

/**
 * Assigns overdue loans to field officers by pincode and workload.
 *
 * 1. Continuity first: a loan stays with its current officer while that officer is active,
 *    in the same branch, covers the pincode and is under their cap. Borrowers deal with the
 *    same person and promises are not lost in a handover.
 * 2. Remaining loans go, highest score first, to the least-utilised officer whose territory
 *    covers the pincode.
 * 3. If every territory officer is full, the loan goes to the least-utilised officer in the
 *    branch (outside_territory); if the whole branch is full, to the least-utilised officer
 *    anyway (over_capacity) so that nothing is left unworked. Managers see both notes.
 */
export function assignLoans(loans: LoanToAssign[], officers: OfficerSlot[]): Map<string, Assignment> {
  const result = new Map<string, Assignment>();
  const active = officers.filter((o) => o.active);
  const load = new Map<string, number>(active.map((o) => [o.id, 0]));
  const byId = new Map(active.map((o) => [o.id, o]));

  const util = (o: OfficerSlot) => (load.get(o.id) ?? 0) / Math.max(o.maxLoad, 1);
  const pick = (candidates: OfficerSlot[]) =>
    [...candidates].sort((a, b) => util(a) - util(b) || (load.get(a.id)! - load.get(b.id)!) || a.id.localeCompare(b.id))[0];
  const take = (loanId: string, o: OfficerSlot, note: AssignmentNote) => {
    load.set(o.id, (load.get(o.id) ?? 0) + 1);
    result.set(loanId, { officerId: o.id, note });
  };

  const ordered = [...loans].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id.localeCompare(b.id));

  const pending: LoanToAssign[] = [];
  for (const loan of ordered) {
    const current = loan.currentOfficerId ? byId.get(loan.currentOfficerId) : undefined;
    if (
      current &&
      current.branchId === loan.branchId &&
      current.pincodes.includes(loan.pincode) &&
      (load.get(current.id) ?? 0) < current.maxLoad
    ) {
      take(loan.id, current, "kept");
    } else {
      pending.push(loan);
    }
  }

  for (const loan of pending) {
    const branchOfficers = active.filter((o) => o.branchId === loan.branchId);
    if (branchOfficers.length === 0) {
      result.set(loan.id, { officerId: null, note: "no_officer" });
      continue;
    }
    const hasRoom = (o: OfficerSlot) => (load.get(o.id) ?? 0) < o.maxLoad;
    const territory = branchOfficers.filter((o) => o.pincodes.includes(loan.pincode) && hasRoom(o));
    if (territory.length) {
      take(loan.id, pick(territory), "territory");
      continue;
    }
    const withRoom = branchOfficers.filter(hasRoom);
    if (withRoom.length) {
      take(loan.id, pick(withRoom), "outside_territory");
      continue;
    }
    take(loan.id, pick(branchOfficers), "over_capacity");
  }

  return result;
}
