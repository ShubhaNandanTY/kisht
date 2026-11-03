import { z } from "zod";
import { db } from "@/db/client";
import { isIsoDate, istDate } from "@/domain/time";
import { MAX_BYTES } from "@/domain/csv";
import { requireSession, serverNow } from "@/server/auth";
import { json, route } from "@/server/http";
import { importOverdueFile } from "@/server/imports";
import { exportOverdueFile } from "@/server/mockLoanSystem";

export const maxDuration = 60;

const mockBody = z.object({ source: z.literal("mock") });

// Upload (multipart: file + asOfDate) or pull from the mock loan system (JSON {source: "mock"}).
// Head of collections only for uploads that affect every branch; branch managers may import too
// because in the client's set-up each branch receives the same company-wide file.
export const POST = route(async (req: Request) => {
  const s = await requireSession(["manager", "head"]);
  const now = await serverNow();
  const today = istDate(now);
  const type = req.headers.get("content-type") ?? "";

  if (type.includes("application/json")) {
    mockBody.parse(await req.json());
    const file = await exportOverdueFile(db, today);
    return json(await importOverdueFile(db, { csv: file.csv, fileName: `lms_overdue_${today.replace(/-/g, "")}.csv`, asOfDate: today, userId: s.sub, now }));
  }

  const form = await req.formData();
  const file = form.get("file");
  const asOfDate = String(form.get("asOfDate") ?? today);
  if (!(file instanceof File)) return json({ error: "no_file" }, 400);
  if (file.size > MAX_BYTES) return json({ error: "file_too_large" }, 413);
  if (!/\.csv$/i.test(file.name)) return json({ error: "not_csv" }, 400);
  if (!isIsoDate(asOfDate) || asOfDate > today) return json({ error: "bad_date" }, 400);
  return json(await importOverdueFile(db, { csv: await file.text(), fileName: file.name, asOfDate, userId: s.sub, now }));
});
