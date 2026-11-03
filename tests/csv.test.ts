import { describe, expect, it } from "vitest";
import { parseOverdueCsv } from "@/domain/csv";

const header =
  "loan_id,borrower_name,business_type,phone,address,pincode,branch_code,outstanding,overdue_amount,dpd,emi_amount,last_payment_date,last_payment_amount,missed_emis_12m,months_on_book,language,lat,lng";
const good = "LN-10293,Company B,Packaging unit,+91 90000 10293,Plot 4 Sanwer Road,452015,SNR,640000,58000,12,29000,2026-09-22,29000,1,26,hi,22.75,75.86";
const opts = { asOfDate: "2026-11-03", branchCodes: ["SNR", "SYG"] };

describe("daily overdue CSV import", () => {
  it("parses a valid row and normalises the phone number", () => {
    const r = parseOverdueCsv(`${header}\n${good}\n`, opts);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ loan_id: "LN-10293", phone: "9000010293", dpd: 12, outstanding: 640000, language: "hi" });
  });

  it("reports bad rows with line numbers and keeps the good ones", () => {
    const bad = good.replace("LN-10293", "LN-55555").replace(",12,", ",abc,");
    const r = parseOverdueCsv(`${header}\n${good}\n${bad}\n`, opts);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([{ row: 3, loanId: "LN-55555", message: expect.stringContaining("dpd") }]);
  });

  it("rejects unknown branches, duplicates, future payments and overdue above outstanding", () => {
    const rows = [
      good,
      good, // duplicate
      good.replace("LN-10293", "LN-20001").replace(",SNR,", ",XYZ,"),
      good.replace("LN-10293", "LN-20002").replace("2026-09-22", "2026-12-01"),
      good.replace("LN-10293", "LN-20003").replace(",58000,", ",900000,"),
    ];
    const r = parseOverdueCsv(`${header}\n${rows.join("\n")}`, opts);
    expect(r.rows).toHaveLength(1);
    expect(r.errors.map((e) => e.message)).toEqual([
      expect.stringContaining("more than once"),
      expect.stringContaining("not a known branch"),
      expect.stringContaining("after the file date"),
      expect.stringContaining("more than outstanding"),
    ]);
  });

  it("fails the whole file when required columns are missing", () => {
    const r = parseOverdueCsv("loan_id,dpd\nLN-1,3", opts);
    expect(r.fatal).toMatch(/^missing_columns:/);
  });

  it("strips spreadsheet formula prefixes from text (CSV injection)", () => {
    const r = parseOverdueCsv(`${header}\n${good.replace("Company B", "=HYPERLINK(1)")}`, opts);
    expect(r.rows[0].borrower_name).toBe("HYPERLINK(1)");
  });
});
