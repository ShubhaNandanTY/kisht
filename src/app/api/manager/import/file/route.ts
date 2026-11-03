import { db } from "@/db/client";
import { istDate } from "@/domain/time";
import { requireSession, serverNow } from "@/server/auth";
import { route } from "@/server/http";
import { exportOverdueFile } from "@/server/mockLoanSystem";

// Download today's file from the mock loan system, to inspect or edit before uploading.
export const GET = route(async () => {
  await requireSession(["manager", "head"]);
  const today = istDate(await serverNow());
  const { csv } = await exportOverdueFile(db, today);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lms_overdue_${today.replace(/-/g, "")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
