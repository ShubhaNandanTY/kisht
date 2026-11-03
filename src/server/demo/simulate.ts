import { addDays, daysBetween, istInstant } from "@/domain/time";
import { distanceMeters } from "@/domain/geo";
import { BRANCHES, BUSINESS_TYPES, OFFICERS, PINCODES, businessName, type BranchId } from "./reference";

/**
 * A day-by-day simulation of the loan book that produces the demo history: loans falling due,
 * officer visits, promises kept and broken, cures, rolls and NPAs. The hidden "true" behaviour
 * is driven by a per-borrower risk factor the app never sees; the model has to recover it from
 * the observable data (DPD, payments, promises, reachability), as it would in production.
 *
 * Scale is an assumption: 3 of the client's branches and 12 of 55 officers, so roughly 12/55 of
 * the 450 monthly entrants (~100 a month) and about 18 live loans per officer.
 */

export type SimLoan = {
  id: string;
  borrowerName: string;
  businessType: string;
  phone: string;
  address: string;
  pincode: string;
  lat: number;
  lng: number;
  branchId: BranchId;
  language: "hi" | "en";
  emiAmount: number;
  outstanding: number;
  missedEmis12m: number;
  monthsOnBook: number; // as of today
  // state
  risk: number;
  overdue: boolean;
  dpd: number;
  overdueAmount: number;
  entryDate: string | null;
  officerId: string | null;
  lastPaymentDate: string;
  lastPaymentAmount: number;
  curedOn: string | null;
  npa: boolean;
  everOverdue: boolean;
  activePromiseId: string | null;
  scripted?: boolean;
};

export type SimSnapshot = {
  asOfDate: string;
  loanId: string;
  branchId: string;
  officerId: string | null;
  dpd: number;
  outstanding: number;
  overdueAmount: number;
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;
};

export type SimOutcome = {
  id: string;
  loanId: string;
  officerId: string;
  type: "paid" | "promise" | "not_reachable" | "dispute";
  amount: number | null;
  occurredAt: Date;
  capturedAt: Date;
  receivedAt: Date;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  gpsStatus: "ok" | "denied" | "unavailable" | "timeout";
  distanceM: number | null;
  flags: string[];
  note: string | null;
};

export type SimPromise = {
  id: string;
  loanId: string;
  officerId: string;
  outcomeId: string;
  promisedDate: string;
  amount: number;
  status: "open" | "kept" | "broken" | "superseded";
  createdAt: Date;
  resolvedAt: Date | null;
  willKeep: boolean;
};

export type SimAttempt = {
  id: string;
  loanId: string;
  officerId: string;
  channel: "call" | "visit" | "message";
  at: Date;
  allowed: boolean;
  blockReason: string | null;
};

export type SimResult = {
  today: string;
  dataFrom: string;
  loans: SimLoan[];
  snapshots: SimSnapshot[];
  outcomes: SimOutcome[];
  promises: SimPromise[];
  attempts: SimAttempt[];
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function simulate(today: string, opts: { nowMs?: number; seed?: number } = {}): SimResult {
  const rand = mulberry32(opts.seed ?? 36);
  const normal = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  let uuidCounter = 0;
  const uuid = () => {
    const h = (n: number) => Math.floor(rand() * 16 ** n).toString(16).padStart(n, "0");
    uuidCounter++;
    return `${h(8)}-${h(4)}-4${h(3)}-a${h(3)}-${uuidCounter.toString(16).padStart(4, "0")}${h(8)}`;
  };
  const nowMs = opts.nowMs ?? Date.now();

  const simStart = addDays(today, -150);
  const dataFrom = addDays(today, -119);
  const branchShift: Record<BranchId, number> = { SYG: -0.25, SNR: 0, PTM: 0.35 };
  const branchWeight: [BranchId, number][] = [["SYG", 0.36], ["SNR", 0.36], ["PTM", 0.28]];
  const pincodesOf = (b: BranchId) => Object.entries(PINCODES).filter(([, v]) => v.branch === b).map(([k]) => k);

  // ---- the loan book (only the slice served by these branches) ----
  const sampleIds = new Set(["LN-10293", "LN-10871", "LN-11930"]);
  const usedIds = new Set<string>(sampleIds);
  const loans: SimLoan[] = [];
  for (let i = 0; i < 2300; i++) {
    let id: string;
    do id = `LN-${10000 + Math.floor(rand() * 9000)}`;
    while (usedIds.has(id));
    usedIds.add(id);
    const r = rand();
    const branchId = (r < branchWeight[0][1] ? "SYG" : r < branchWeight[0][1] + branchWeight[1][1] ? "SNR" : "PTM") as BranchId;
    const pincode = pick(pincodesOf(branchId));
    const pc = PINCODES[pincode];
    const type = pick(BUSINESS_TYPES[branchId]);
    const outstanding = Math.round(Math.min(Math.max(Math.exp(Math.log(420_000) + 0.6 * normal()), 60_000), 2_500_000) / 1000) * 1000;
    const risk = normal() + branchShift[branchId];
    const missed = Math.min(12, Math.max(0, Math.round(1.2 * Math.exp(0.55 * risk) + normal() * 0.6 - 0.3)));
    const lat = pc.lat + (rand() - 0.5) * 0.024;
    const lng = pc.lng + (rand() - 0.5) * 0.024;
    loans.push({
      id,
      borrowerName: businessName(Math.floor(rand() * 1000), type, Math.floor(rand() * 1000)),
      businessType: type,
      phone: `90000${id.slice(3)}`.slice(0, 10),
      address: `Shop ${1 + Math.floor(rand() * 180)}, ${pc.area}, ${branchId === "PTM" ? "Pithampur, Dhar" : "Indore"} ${pincode}`,
      pincode,
      lat,
      lng,
      branchId,
      language: rand() < 0.78 ? "hi" : "en",
      emiAmount: Math.round((outstanding * (0.03 + rand() * 0.02)) / 100) * 100,
      outstanding,
      missedEmis12m: missed,
      monthsOnBook: 2 + Math.floor(rand() * 58),
      risk,
      overdue: false,
      dpd: 0,
      overdueAmount: 0,
      entryDate: null,
      officerId: null,
      lastPaymentDate: addDays(simStart, -Math.floor(rand() * 30)),
      lastPaymentAmount: 0,
      curedOn: null,
      npa: false,
      everOverdue: false,
      activePromiseId: null,
    });
    loans[loans.length - 1].lastPaymentAmount = loans[loans.length - 1].emiAmount;
  }

  // ---- the three loans from the brief, scripted exactly ----
  const scripted: (Partial<SimLoan> & { id: string; officer: string; dpdToday: number })[] = [
    { id: "LN-10293", borrowerName: "Company B", businessType: "Packaging unit", outstanding: 640_000, emiAmount: 29_000, dpdToday: 12, officer: "u-rahul", pincode: "452015", branchId: "SNR", missedEmis12m: 1, monthsOnBook: 26, language: "hi" },
    { id: "LN-10871", borrowerName: "Company C", businessType: "Fertiliser shop", outstanding: 310_000, emiAmount: 13_000, dpdToday: 27, officer: "u-neha", pincode: "454775", branchId: "PTM", missedEmis12m: 3, monthsOnBook: 18, language: "hi" },
    { id: "LN-11930", borrowerName: "Company D", businessType: "Printing press", outstanding: 220_000, emiAmount: 9_500, dpdToday: 19, officer: "u-imran", pincode: "452007", branchId: "SYG", missedEmis12m: 2, monthsOnBook: 30, language: "en" },
  ];
  for (const s of scripted) {
    const pc = PINCODES[s.pincode!];
    const entry = addDays(today, -(s.dpdToday - 1));
    loans.push({
      id: s.id,
      borrowerName: s.borrowerName!,
      businessType: s.businessType!,
      phone: `90000${s.id.slice(3)}`.slice(0, 10),
      address: `Shop ${s.id.slice(-2)}, ${pc.area}, Indore ${s.pincode}`,
      pincode: s.pincode!,
      lat: pc.lat + 0.004,
      lng: pc.lng - 0.003,
      branchId: s.branchId!,
      language: s.language!,
      emiAmount: s.emiAmount!,
      outstanding: s.outstanding!,
      missedEmis12m: s.missedEmis12m!,
      monthsOnBook: s.monthsOnBook!,
      risk: 0.6,
      overdue: false,
      dpd: 0,
      overdueAmount: 0,
      entryDate: entry,
      officerId: s.officer,
      lastPaymentDate: addDays(entry, -31),
      lastPaymentAmount: s.emiAmount!,
      curedOn: null,
      npa: false,
      everOverdue: true,
      activePromiseId: null,
      scripted: true,
    });
  }

  const officerLoad = new Map<string, number>(OFFICERS.map((o) => [o.id, 0]));
  const officerFor = (loan: SimLoan) => {
    const cands = OFFICERS.filter((o) => o.branch === loan.branchId && (o.pincodes as readonly string[]).includes(loan.pincode));
    const pool = cands.length ? cands : OFFICERS.filter((o) => o.branch === loan.branchId);
    return [...pool].sort((a, b) => officerLoad.get(a.id)! - officerLoad.get(b.id)!)[0].id;
  };

  const snapshots: SimSnapshot[] = [];
  const outcomes: SimOutcome[] = [];
  const promises: SimPromise[] = [];
  const attempts: SimAttempt[] = [];
  const promiseById = new Map<string, SimPromise>();
  const brokenCount = new Map<string, number>();
  const lastNotReachable = new Map<string, string>();

  const at = (day: string, fromH: number, toH: number) => {
    const mins = Math.floor((fromH + rand() * (toH - fromH)) * 60);
    return istInstant(day, Math.floor(mins / 60), mins % 60);
  };

  const gpsFor = (loan: SimLoan) => {
    const g = rand();
    if (g < 0.05) return { gpsStatus: "timeout" as const, lat: null, lng: null, accuracyM: null, distanceM: null };
    if (g < 0.07) return { gpsStatus: "denied" as const, lat: null, lng: null, accuracyM: null, distanceM: null };
    const far = rand() < 0.015;
    const spread = far ? 0.02 : 0.0025;
    const lat = loan.lat + (rand() - 0.5) * spread;
    const lng = loan.lng + (rand() - 0.5) * spread;
    return { gpsStatus: "ok" as const, lat, lng, accuracyM: Math.round(10 + rand() * 60), distanceM: distanceMeters({ lat, lng }, loan) };
  };

  const logOutcome = (loan: SimLoan, day: string, type: SimOutcome["type"], amount: number | null, when?: Date) => {
    const occurredAt = when ?? at(day, 10, 18.5);
    if (occurredAt.getTime() > nowMs - 5 * 60_000) return null; // never invent the future
    const offlineDelay = rand() < 0.25 ? (30 + rand() * 300) * 60_000 : rand() * 120_000;
    const gps = gpsFor(loan);
    const flags: string[] = [];
    if (gps.distanceM !== null && gps.distanceM > 500) flags.push("far_from_borrower");
    // Most visits are logged on the spot; some are typed in the next morning.
    const nextDay = rand() < 0.07 && occurredAt.getTime() + 86_400_000 < nowMs;
    const capturedAt = nextDay ? istInstant(addDays(day, 1), 9, Math.floor(rand() * 50)) : new Date(occurredAt.getTime() + 20_000);
    if (nextDay) flags.push("logged_next_day", "late_entry");
    const receivedAt = new Date(Math.min(capturedAt.getTime() + offlineDelay, nowMs));
    if (receivedAt.getTime() - capturedAt.getTime() > 3_600_000) flags.push("synced_late");
    const o: SimOutcome = {
      id: uuid(),
      loanId: loan.id,
      officerId: loan.officerId!,
      type,
      amount,
      occurredAt,
      capturedAt,
      receivedAt,
      ...gps,
      flags,
      note: null,
    };
    outcomes.push(o);
    attempts.push({ id: uuid(), loanId: loan.id, officerId: loan.officerId!, channel: "visit", at: occurredAt, allowed: true, blockReason: null });
    return o;
  };

  const resolvePromise = (p: SimPromise, status: "kept" | "broken", day: string) => {
    p.status = status;
    p.resolvedAt = istInstant(day, 7, 30); // known when the next morning's file is imported
  };

  const cure = (loan: SimLoan, day: string, amount: number) => {
    loan.overdue = false;
    loan.curedOn = addDays(day, 1);
    loan.lastPaymentDate = day;
    loan.lastPaymentAmount = amount;
    loan.dpd = 0;
    loan.overdueAmount = 0;
    if (loan.activePromiseId) {
      const p = promiseById.get(loan.activePromiseId)!;
      if (p.status === "open") resolvePromise(p, "kept", addDays(day, 1));
      loan.activePromiseId = null;
    }
    if (loan.officerId) officerLoad.set(loan.officerId, officerLoad.get(loan.officerId)! - 1);
  };

  for (let day = simStart; day <= today; day = addDays(day, 1)) {
    const isToday = day === today;
    for (const loan of loans) {
      if (loan.npa) continue;

      if (loan.scripted) {
        if (day >= loan.entryDate!) {
          loan.overdue = true;
          loan.dpd = daysBetween(loan.entryDate!, day) + 1;
          loan.overdueAmount = loan.emiAmount * Math.ceil(loan.dpd / 30);
          if (day >= dataFrom) snapshots.push(snap(loan, day));
        }
        continue;
      }

      if (!loan.overdue) {
        // Monthly EMI falls due 30 days after the last payment.
        if (daysBetween(loan.lastPaymentDate, day) < 30) continue;
        const miss = rand() < sigmoid(-2.75 + 0.85 * loan.risk + 0.12 * loan.missedEmis12m);
        if (!miss) {
          loan.lastPaymentDate = day;
          loan.lastPaymentAmount = loan.emiAmount;
          continue;
        }
        loan.overdue = true;
        loan.everOverdue = true;
        loan.dpd = 0;
        loan.entryDate = day;
        loan.overdueAmount = loan.emiAmount;
        loan.curedOn = null;
        loan.officerId = officerFor(loan);
        officerLoad.set(loan.officerId, officerLoad.get(loan.officerId)! + 1);
      }

      // Morning: the day's file shows the loan one day older.
      loan.dpd += 1;
      if (loan.dpd > 1 && (loan.dpd - 1) % 30 === 0) loan.overdueAmount += loan.emiAmount;
      if (loan.dpd > 90) {
        loan.npa = true; // hands over to the legal/recovery team: out of the field app
        loan.overdue = false;
        if (loan.activePromiseId) {
          const p = promiseById.get(loan.activePromiseId)!;
          if (p.status === "open") resolvePromise(p, "broken", day);
          loan.activePromiseId = null;
        }
        if (loan.officerId) officerLoad.set(loan.officerId, officerLoad.get(loan.officerId)! - 1);
        continue;
      }
      if (day >= dataFrom) snapshots.push(snap(loan, day));

      // A promise is broken once the grace day passes with no payment.
      if (loan.activePromiseId) {
        const p = promiseById.get(loan.activePromiseId)!;
        if (day > addDays(p.promisedDate, 1) && p.status === "open") {
          resolvePromise(p, "broken", day);
          brokenCount.set(loan.id, (brokenCount.get(loan.id) ?? 0) + 1);
          loan.activePromiseId = null;
        }
      }
      if (isToday) {
        // Today: some officers have already been out this morning.
        if (rand() < 0.18) {
          const o = logOutcome(loan, day, rand() < 0.5 ? "not_reachable" : "promise", null, at(day, 10, 13.5));
          if (o?.type === "promise") makePromise(loan, o, day);
        }
        continue;
      }

      // During the day.
      const promise = loan.activePromiseId ? promiseById.get(loan.activePromiseId)! : null;
      if (promise && promise.promisedDate === day && promise.willKeep) {
        cure(loan, day, loan.overdueAmount);
        continue;
      }
      const bucketFactor = loan.dpd > 60 ? 0.35 : loan.dpd > 30 ? 0.55 : 1;
      // Observable behaviour carries part of the hidden risk: recent part-payers are trying,
      // promise-breakers and unreachable borrowers are not.
      const recentPart = daysBetween(loan.lastPaymentDate, day) <= 15 ? 1.6 : 1;
      const unreachable = (lastNotReachable.get(loan.id) ?? "") >= addDays(day, -14) ? 0.6 : 1;
      const breaker = Math.exp(-0.35 * (brokenCount.get(loan.id) ?? 0));
      const hazard = 0.029 * Math.exp(-0.75 * loan.risk) * (loan.dpd <= 5 ? 1.7 : 1) * bucketFactor * recentPart * unreachable * breaker;
      if (rand() < hazard) {
        cure(loan, day, loan.overdueAmount);
        continue;
      }

      const visitP = promise ? 0.06 : 0.24;
      if (rand() < visitP) {
        const pPaid = 0.09 * Math.exp(-0.45 * loan.risk) * bucketFactor;
        const pDispute = 0.025;
        const pNotReach = Math.min(0.2 * Math.exp(0.4 * loan.risk), 0.5);
        const u = rand();
        if (u < pPaid) {
          const partial = rand() < 0.35;
          const amount = partial ? Math.round((loan.overdueAmount * (0.4 + rand() * 0.2)) / 100) * 100 : loan.overdueAmount;
          const o = logOutcome(loan, day, "paid", amount);
          if (!o) continue;
          if (partial) {
            loan.lastPaymentDate = day;
            loan.lastPaymentAmount = amount;
            loan.overdueAmount = Math.max(loan.overdueAmount - amount, 100);
          } else cure(loan, day, amount);
        } else if (u < pPaid + pDispute) {
          logOutcome(loan, day, "dispute", null);
        } else if (u < pPaid + pDispute + pNotReach) {
          if (logOutcome(loan, day, "not_reachable", null)) lastNotReachable.set(loan.id, day);
        } else {
          const o = logOutcome(loan, day, "promise", null);
          if (o) makePromise(loan, o, day);
        }
      }
      if (rand() < 0.1 && loan.officerId) {
        // Phone calls. A few are attempted after 7 pm and blocked by the app.
        const late = rand() < 0.03;
        const when = late ? at(day, 19.05, 20.5) : at(day, 9, 18.9);
        if (when.getTime() < nowMs)
          attempts.push({ id: uuid(), loanId: loan.id, officerId: loan.officerId, channel: "call", at: when, allowed: !late, blockReason: late ? "after_7pm" : null });
      }
    }
  }

  function makePromise(loan: SimLoan, o: SimOutcome, day: string) {
    const previous = loan.activePromiseId ? promiseById.get(loan.activePromiseId) : null;
    if (previous?.status === "open") {
      previous.status = "superseded"; // a new promise replaces the old one, as in the app
      previous.resolvedAt = o.capturedAt;
    }
    const broken = brokenCount.get(loan.id) ?? 0;
    const p: SimPromise = {
      id: uuid(),
      loanId: loan.id,
      officerId: loan.officerId!,
      outcomeId: o.id,
      promisedDate: addDays(day, 1 + Math.floor(rand() * 6)),
      amount: loan.overdueAmount,
      status: "open",
      createdAt: o.capturedAt,
      resolvedAt: null,
      willKeep: rand() < sigmoid(1.35 - 1.1 * loan.risk - 0.7 * broken - 0.015 * loan.dpd),
    };
    o.amount = p.amount;
    promises.push(p);
    promiseById.set(p.id, p);
    loan.activePromiseId = p.id;
  }

  function snap(loan: SimLoan, day: string): SimSnapshot {
    return {
      asOfDate: day,
      loanId: loan.id,
      branchId: loan.branchId,
      officerId: loan.officerId,
      dpd: loan.dpd,
      outstanding: loan.outstanding,
      overdueAmount: loan.overdueAmount,
      lastPaymentDate: loan.lastPaymentDate,
      lastPaymentAmount: loan.lastPaymentAmount,
    };
  }

  // ---- scripted history for the sample loans ----
  const byId = new Map(loans.map((l) => [l.id, l]));
  const scriptOutcome = (id: string, day: string, h: number, m: number, type: SimOutcome["type"]) => {
    const loan = byId.get(id)!;
    return logOutcome(loan, day, type, null, istInstant(day, h, m));
  };
  scriptOutcome("LN-10293", addDays(today, -6), 12, 40, "not_reachable");
  const b = scriptOutcome("LN-10293", addDays(today, -2), 11, 20, "promise");
  if (b) {
    const p: SimPromise = { id: uuid(), loanId: "LN-10293", officerId: "u-rahul", outcomeId: b.id, promisedDate: addDays(today, 2), amount: 29_000, status: "open", createdAt: b.capturedAt, resolvedAt: null, willKeep: true };
    b.amount = 29_000;
    promises.push(p);
  }
  scriptOutcome("LN-10871", addDays(today, -8), 15, 5, "not_reachable");
  scriptOutcome("LN-10871", addDays(today, -3), 10, 45, "not_reachable");
  const d = scriptOutcome("LN-11930", addDays(today, -6), 16, 10, "promise");
  if (d) {
    const p: SimPromise = { id: uuid(), loanId: "LN-11930", officerId: "u-imran", outcomeId: d.id, promisedDate: addDays(today, -3), amount: 9_500, status: "broken", createdAt: d.capturedAt, resolvedAt: istInstant(addDays(today, -1), 7, 30), willKeep: false };
    d.amount = 9_500;
    promises.push(p);
  }
  for (const s of loans.filter((l) => l.scripted)) {
    s.lastPaymentDate = addDays(s.entryDate!, -31);
    for (const sn of snapshots.filter((x) => x.loanId === s.id)) {
      sn.lastPaymentDate = s.lastPaymentDate;
      sn.officerId = s.officerId;
    }
  }

  return { today, dataFrom, loans: loans.filter((l) => l.everOverdue), snapshots, outcomes, promises, attempts };
}

export const BRANCH_PHONE: Record<string, string> = Object.fromEntries(BRANCHES.map((b) => [b.id, b.phone]));
