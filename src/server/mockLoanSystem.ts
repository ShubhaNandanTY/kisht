import { and, eq, gte, inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import { loans, outcomes, promises } from "@/db/schema";
import { CSV_COLUMNS, toCsv } from "@/domain/csv";
import { addDays, daysBetween, istInstant } from "@/domain/time";
import { latestImportDate } from "./imports";

/**
 * Stand-in for the client's loan management system, which in production drops the overdue
 * export each morning. It produces the file for `date` by moving the current book forward:
 * loans age, some pay (more likely when they promised, or when the model says low risk),
 * officer-reported payments clear, and a few performing loans fall due.
 * The output goes through the exact same import code as a file a manager uploads.
 */
export async function exportOverdueFile(db: DB, date: string): Promise<{ csv: string; rows: number; from: string | null }> {
  const from = await latestImportDate(db);
  const days = from ? Math.max(daysBetween(from, date), 0) : 0;
  let seed = Number(date.replace(/-/g, "")) % 2147483647;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  const book = await db.select().from(loans).where(inArray(loans.status, ["overdue", "npa"]));
  const ids = book.map((l) => l.id);
  const openPromises = ids.length ? await db.select().from(promises).where(and(inArray(promises.loanId, ids), eq(promises.status, "open"))) : [];
  const paidSince = from && ids.length
    ? await db
        .select({ loanId: outcomes.loanId, amount: outcomes.amount, occurredAt: outcomes.occurredAt })
        .from(outcomes)
        .where(and(inArray(outcomes.loanId, ids), eq(outcomes.type, "paid"), gte(outcomes.occurredAt, istInstant(from, 0))))
    : [];

  const rows: Record<string, string | number | null>[] = [];
  for (const l of book) {
    let dpd = l.dpd + days;
    let overdue = l.overdueAmount + l.emiAmount * (Math.floor(dpd / 30) - Math.floor(l.dpd / 30));
    let lastPaymentDate = l.lastPaymentDate;
    let lastPaymentAmount = l.lastPaymentAmount;

    if (days > 0) {
      const reported = paidSince.filter((p) => p.loanId === l.id).reduce((s, p) => s + (p.amount ?? 0), 0);
      const promise = openPromises.find((p) => p.loanId === l.id && p.promisedDate >= from! && p.promisedDate < date);
      const p = l.riskProbability ?? 0.4;
      const pPay = 1 - Math.pow(1 - 0.05 * (1.2 - p), days);
      const pays = reported >= overdue * 0.9 || (promise && rand() < 0.45) || (l.status === "overdue" && rand() < pPay);
      if (pays) continue; // paid up: drops out of the overdue list
      if (reported > 0) {
        overdue = Math.max(overdue - reported, 100);
        lastPaymentDate = addDays(date, -1);
        lastPaymentAmount = reported;
      }
    }
    rows.push(row(l, dpd, overdue, lastPaymentDate, lastPaymentAmount));
  }

  // A few performing loans fall due each day. Re-use previously cured borrowers so names stay realistic.
  if (days > 0) {
    const cured = await db.select().from(loans).where(eq(loans.status, "cured"));
    const n = Math.min(cured.length, Math.round(days * (5 + rand() * 3)));
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rand() * cured.length);
      const l = cured.splice(j, 1)[0];
      const dpd = 1 + Math.floor(rand() * Math.min(days, 5));
      rows.push(row(l, dpd, l.emiAmount, addDays(date, -(dpd + 30)), l.emiAmount));
    }
  }

  return { csv: toCsv(rows, CSV_COLUMNS), rows: rows.length, from };
}

function row(
  l: typeof loans.$inferSelect,
  dpd: number,
  overdue: number,
  lastPaymentDate: string | null,
  lastPaymentAmount: number | null,
): Record<string, string | number | null> {
  return {
    loan_id: l.id,
    borrower_name: l.borrowerName,
    business_type: l.businessType,
    phone: l.phone,
    address: l.address,
    pincode: l.pincode,
    branch_code: l.branchId,
    outstanding: l.outstanding,
    overdue_amount: Math.min(overdue, l.outstanding),
    dpd,
    emi_amount: l.emiAmount,
    last_payment_date: lastPaymentDate,
    last_payment_amount: lastPaymentAmount,
    missed_emis_12m: Math.min(l.missedEmis12m + (Math.floor(dpd / 30) - Math.floor(l.dpd / 30) > 0 ? 1 : 0), 12),
    months_on_book: l.monthsOnBook,
    language: l.language,
    lat: l.lat?.toFixed(5) ?? null,
    lng: l.lng?.toFixed(5) ?? null,
  };
}
