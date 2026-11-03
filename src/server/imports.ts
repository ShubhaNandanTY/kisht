import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { auditLog, branches, imports, loans, outcomes, promises, snapshots } from "@/db/schema";
import { parseOverdueCsv, type RowError } from "@/domain/csv";
import { evaluatePromise } from "@/domain/promises";
import { addDays } from "@/domain/time";
import { PINCODES } from "./demo/reference";
import { rescoreAndAssign } from "./scoring";

export type ImportSummary =
  | { ok: false; error: string; errors?: RowError[] }
  | {
      ok: true;
      importId: number;
      asOfDate: string;
      total: number;
      imported: number;
      rejected: number;
      newlyOverdue: number;
      cured: number;
      npa: number;
      reassigned: number;
      promisesKept: number;
      promisesBroken: number;
      errors: RowError[];
    };

export async function latestImportDate(db: DB): Promise<string | null> {
  const [row] = await db.select({ d: imports.asOfDate }).from(imports).orderBy(desc(imports.asOfDate)).limit(1);
  return row?.d ?? null;
}

/**
 * Imports the loan system's daily overdue file. Re-importing the same date replaces that day
 * (so a corrected file can be uploaded); an older date is refused so history cannot be rewound.
 */
export async function importOverdueFile(
  db: DB,
  input: { csv: string; fileName: string; asOfDate: string; userId: string | null; now: Date },
): Promise<ImportSummary> {
  const latest = await latestImportDate(db);
  if (latest && input.asOfDate < latest) return { ok: false, error: "older_than_latest" };

  const branchRows = await db.select({ id: branches.id }).from(branches);
  const parsed = parseOverdueCsv(input.csv, { asOfDate: input.asOfDate, branchCodes: branchRows.map((b) => b.id) });
  if (parsed.fatal) return { ok: false, error: parsed.fatal };
  if (!parsed.rows.length) return { ok: false, error: "no_valid_rows", errors: parsed.errors.slice(0, 200) };

  const fileIds = parsed.rows.map((r) => r.loan_id);
  const existing = await db.select({ id: loans.id, status: loans.status }).from(loans).where(inArray(loans.id, fileIds));
  const wasOverdue = new Set(existing.filter((e) => e.status === "overdue").map((e) => e.id));

  let newlyOverdue = 0;
  let npa = 0;
  const values = parsed.rows.map((r) => {
    const status = r.dpd > 90 ? ("npa" as const) : ("overdue" as const);
    if (status === "npa") npa++;
    if (status === "overdue" && !wasOverdue.has(r.loan_id)) newlyOverdue++;
    const geo = PINCODES[r.pincode];
    return {
      id: r.loan_id,
      borrowerName: r.borrower_name,
      businessType: r.business_type,
      phone: r.phone,
      address: r.address,
      pincode: r.pincode,
      lat: r.lat ?? geo?.lat ?? null,
      lng: r.lng ?? geo?.lng ?? null,
      branchId: r.branch_code,
      language: r.language,
      emiAmount: r.emi_amount,
      outstanding: r.outstanding,
      overdueAmount: r.overdue_amount,
      dpd: r.dpd,
      missedEmis12m: r.missed_emis_12m,
      monthsOnBook: r.months_on_book,
      lastPaymentDate: r.last_payment_date,
      lastPaymentAmount: r.last_payment_amount ?? null,
      status,
      overdueSince: addDays(input.asOfDate, -(r.dpd - 1)),
      curedOn: null,
      lastImportDate: input.asOfDate,
      updatedAt: input.now,
    };
  });
  const fromFile = (col: string) => sql.raw(`excluded.${col}`);
  for (let i = 0; i < values.length; i += 500) {
    await db
      .insert(loans)
      .values(values.slice(i, i + 500))
      .onConflictDoUpdate({
        target: loans.id,
        set: {
          borrowerName: fromFile("borrower_name"),
          businessType: fromFile("business_type"),
          phone: fromFile("phone"),
          address: fromFile("address"),
          pincode: fromFile("pincode"),
          lat: fromFile("lat"),
          lng: fromFile("lng"),
          branchId: fromFile("branch_id"),
          language: fromFile("language"),
          emiAmount: fromFile("emi_amount"),
          outstanding: fromFile("outstanding"),
          overdueAmount: fromFile("overdue_amount"),
          dpd: fromFile("dpd"),
          missedEmis12m: fromFile("missed_emis_12m"),
          monthsOnBook: fromFile("months_on_book"),
          lastPaymentDate: fromFile("last_payment_date"),
          lastPaymentAmount: fromFile("last_payment_amount"),
          status: fromFile("status"),
          overdueSince: fromFile("overdue_since"),
          curedOn: sql`NULL`,
          lastImportDate: fromFile("last_import_date"),
          updatedAt: fromFile("updated_at"),
          assignedOfficerId: sql`CASE WHEN excluded.status = 'npa' THEN NULL ELSE loans.assigned_officer_id END`,
        },
      });
  }

  // Loans that were overdue yesterday and are missing today have been paid up.
  const curedRows = await db
    .update(loans)
    .set({ status: "cured", curedOn: input.asOfDate, managerRank: null, updatedAt: input.now })
    .where(and(eq(loans.status, "overdue"), notInArray(loans.id, fileIds)))
    .returning({ id: loans.id });

  await db.delete(snapshots).where(eq(snapshots.asOfDate, input.asOfDate));
  for (let i = 0; i < parsed.rows.length; i += 500) {
    await db.insert(snapshots).values(
      parsed.rows.slice(i, i + 500).map((r) => ({
        asOfDate: input.asOfDate,
        loanId: r.loan_id,
        branchId: r.branch_code,
        dpd: r.dpd,
        outstanding: r.outstanding,
        overdueAmount: r.overdue_amount,
        lastPaymentDate: r.last_payment_date,
        lastPaymentAmount: r.last_payment_amount ?? null,
      })),
    );
  }

  const { kept, broken } = await settlePromises(db, input.asOfDate, input.now);
  const { reassigned } = await rescoreAndAssign(db, input.asOfDate, { resetPins: true });

  const [imp] = await db
    .insert(imports)
    .values({
      asOfDate: input.asOfDate,
      fileName: input.fileName.slice(0, 120),
      uploadedBy: input.userId,
      rowsTotal: parsed.total,
      rowsOk: parsed.rows.length,
      rowsRejected: parsed.errors.length,
      newlyOverdue,
      cured: curedRows.length,
      reassigned,
      errors: parsed.errors.slice(0, 500),
    })
    .returning({ id: imports.id });
  await db.insert(auditLog).values({ userId: input.userId, action: "import", entity: "imports", entityId: String(imp.id), meta: { rows: parsed.rows.length } });

  return {
    ok: true,
    importId: imp.id,
    asOfDate: input.asOfDate,
    total: parsed.total,
    imported: parsed.rows.length,
    rejected: parsed.errors.length,
    newlyOverdue,
    cured: curedRows.length,
    npa,
    reassigned,
    promisesKept: kept,
    promisesBroken: broken,
    errors: parsed.errors,
  };
}

/** Marks open promises kept or broken from the latest loan data and officer-reported payments. */
export async function settlePromises(db: DB, today: string, now: Date) {
  const open = await db.select().from(promises).where(eq(promises.status, "open"));
  if (!open.length) return { kept: 0, broken: 0 };
  const ids = [...new Set(open.map((p) => p.loanId))];
  const ls = new Map((await db.select().from(loans).where(inArray(loans.id, ids))).map((l) => [l.id, l]));
  const paid = await db
    .select({ loanId: outcomes.loanId, occurredAt: outcomes.occurredAt, amount: outcomes.amount })
    .from(outcomes)
    .where(and(inArray(outcomes.loanId, ids), eq(outcomes.type, "paid")));
  let kept = 0;
  let broken = 0;
  for (const p of open) {
    const l = ls.get(p.loanId);
    if (!l) continue;
    const status = evaluatePromise(
      { promisedDate: p.promisedDate, amount: p.amount, createdAt: p.createdAt, status: p.status },
      {
        loanStatus: l.status,
        curedOn: l.curedOn,
        lastPaymentDate: l.lastPaymentDate,
        lastPaymentAmount: l.lastPaymentAmount,
        paidOutcomes: paid.filter((o) => o.loanId === p.loanId),
      },
      today,
    );
    if (status !== "open") {
      await db.update(promises).set({ status, resolvedAt: now }).where(eq(promises.id, p.id));
      if (status === "kept") kept++;
      if (status === "broken") broken++;
    }
  }
  return { kept, broken };
}
