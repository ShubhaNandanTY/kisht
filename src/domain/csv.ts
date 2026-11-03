import Papa from "papaparse";
import { z } from "zod";
import { isIsoDate } from "./time";

export const CSV_COLUMNS = [
  "loan_id",
  "borrower_name",
  "business_type",
  "phone",
  "address",
  "pincode",
  "branch_code",
  "outstanding",
  "overdue_amount",
  "dpd",
  "emi_amount",
  "last_payment_date",
  "last_payment_amount",
  "missed_emis_12m",
  "months_on_book",
  "language",
  "lat",
  "lng",
] as const;

const REQUIRED = CSV_COLUMNS.filter((c) => !["last_payment_date", "last_payment_amount", "language", "lat", "lng"].includes(c));

export const MAX_ROWS = 20_000;
export const MAX_BYTES = 5 * 1024 * 1024;

const money = z.coerce.number({ invalid_type_error: "must be a number" }).int("must be whole rupees").min(0).max(1_000_000_000);
const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === "" || v === undefined || v === null ? undefined : Number(v)), schema.optional());

// Strip leading characters that spreadsheet apps treat as formulas (CSV injection).
const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "is empty")
    .max(max)
    .transform((s) => s.replace(/^[=+\-@\t\r]+/, "").trim());

const rowSchema = z
  .object({
    loan_id: z.string().trim().regex(/^LN-\d{4,8}$/, "must look like LN-12345"),
    borrower_name: safeText(120),
    business_type: safeText(60),
    phone: z
      .string()
      .transform((s) => s.replace(/[\s-]/g, "").replace(/^(\+91|0)/, ""))
      .pipe(z.string().regex(/^[6-9]\d{9}$/, "must be a 10-digit Indian mobile number")),
    address: safeText(240),
    pincode: z.string().trim().regex(/^\d{6}$/, "must be 6 digits"),
    branch_code: z.string().trim().toUpperCase(),
    outstanding: money,
    overdue_amount: money,
    dpd: z.coerce.number().int().min(1, "must be at least 1 in an overdue list").max(3650),
    emi_amount: money.refine((v) => v > 0, "must be more than 0"),
    last_payment_date: z
      .string()
      .trim()
      .optional()
      .transform((s) => (s ? s : null))
      .refine((s) => s === null || isIsoDate(s), "must be YYYY-MM-DD"),
    last_payment_amount: optionalNumber(z.number().int().min(0)),
    missed_emis_12m: z.coerce.number().int().min(0).max(12),
    months_on_book: z.coerce.number().int().min(0).max(600),
    language: z
      .string()
      .trim()
      .toLowerCase()
      .optional()
      .transform((s) => (s === "en" ? "en" : "hi") as "hi" | "en"),
    lat: optionalNumber(z.number().min(-90).max(90)),
    lng: optionalNumber(z.number().min(-180).max(180)),
  })
  .refine((r) => r.overdue_amount <= r.outstanding, { message: "is more than outstanding", path: ["overdue_amount"] });

export type OverdueRow = z.infer<typeof rowSchema>;
export type RowError = { row: number; loanId?: string; message: string };

export type ParseResult = {
  rows: OverdueRow[];
  errors: RowError[];
  total: number;
  fatal?: string;
};

/**
 * Parses the loan system's daily overdue export. Bad rows are reported with their line
 * number and skipped; the rest still import, so one typo does not block 4,800 loans.
 */
export function parseOverdueCsv(text: string, opts: { asOfDate: string; branchCodes: string[] }): ParseResult {
  if (text.length > MAX_BYTES) return { rows: [], errors: [], total: 0, fatal: "file_too_large" };
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  const headers = parsed.meta.fields ?? [];
  const missing = REQUIRED.filter((c) => !headers.includes(c));
  if (missing.length) return { rows: [], errors: [], total: 0, fatal: `missing_columns:${missing.join(",")}` };
  if (parsed.data.length > MAX_ROWS) return { rows: [], errors: [], total: parsed.data.length, fatal: "too_many_rows" };

  const branches = new Set(opts.branchCodes.map((b) => b.toUpperCase()));
  const seen = new Set<string>();
  const rows: OverdueRow[] = [];
  const errors: RowError[] = [];

  parsed.data.forEach((raw, i) => {
    const line = i + 2; // header is line 1
    const res = rowSchema.safeParse(raw);
    if (!res.success) {
      const issue = res.error.issues[0];
      errors.push({ row: line, loanId: raw.loan_id?.trim() || undefined, message: `${issue.path.join(".") || "row"} ${issue.message}` });
      return;
    }
    const r = res.data;
    if (!branches.has(r.branch_code)) {
      errors.push({ row: line, loanId: r.loan_id, message: `branch_code ${r.branch_code} is not a known branch` });
      return;
    }
    if (r.last_payment_date && r.last_payment_date > opts.asOfDate) {
      errors.push({ row: line, loanId: r.loan_id, message: "last_payment_date is after the file date" });
      return;
    }
    if (seen.has(r.loan_id)) {
      errors.push({ row: line, loanId: r.loan_id, message: "loan_id appears more than once; first row kept" });
      return;
    }
    seen.add(r.loan_id);
    rows.push(r);
  });

  return { rows, errors, total: parsed.data.length };
}

export function toCsv(rows: Record<string, string | number | null | undefined>[], columns: readonly string[]): string {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}
