import { db } from "@/db/client";
import { serverNow } from "@/server/auth";
import { importHistory } from "@/server/dashboard";
import { pageScope } from "@/server/scope";
import { istDate } from "@/domain/time";
import { CSV_COLUMNS } from "@/domain/csv";
import { Card, PageHeader } from "@/components/Card";
import { dateTime, day } from "@/components/format";
import { ImportPanel } from "./ImportPanel";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  await pageScope(searchParams);
  const today = istDate(await serverNow());
  const history = await importHistory(db, 12);
  const latest = history[0]?.asOfDate ?? null;

  return (
    <>
      <PageHeader
        title="Daily import"
        sub="The loan system's overdue export. Each file updates every loan, marks paid-up loans as cured, settles promises, re-scores and re-assigns. Re-importing the same day replaces it."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ImportPanel today={today} latest={latest} />
        <Card title="File format">
          <p className="text-sm text-muted">CSV with a header row. Required columns:</p>
          <p className="mt-2 font-mono text-xs leading-relaxed break-words text-ink">
            {CSV_COLUMNS.filter((c) => !["last_payment_date", "last_payment_amount", "language", "lat", "lng"].includes(c)).join(", ")}
          </p>
          <p className="mt-3 text-sm text-muted">Optional: last_payment_date, last_payment_amount, language (hi/en), lat, lng.</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Up to 20,000 rows and 5 MB.</li>
            <li>Bad rows are skipped and listed with their line number; good rows still import.</li>
            <li>DPD above 90 marks the loan NPA and takes it off field lists (legal recovery is a separate process).</li>
            <li>Loans missing from today&apos;s file are treated as paid up.</li>
          </ul>
          <a href="/samples/overdue-with-errors.csv" download className="mt-4 inline-block text-sm text-accent">
            Download a sample file with deliberate errors →
          </a>
        </Card>
      </div>

      <Card title="Recent imports" className="mt-6">
        <div className="-mx-5 overflow-x-auto" tabIndex={0} role="region" aria-label="Recent imports">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-5 pb-2 font-normal">File date</th>
                <th className="pb-2 font-normal">File</th>
                <th className="pb-2 text-right font-normal">Rows</th>
                <th className="pb-2 text-right font-normal">Rejected</th>
                <th className="pb-2 text-right font-normal">New overdue</th>
                <th className="pb-2 text-right font-normal">Cured</th>
                <th className="px-5 pb-2 text-right font-normal">Imported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="px-5 py-2.5 font-medium">{day(h.asOfDate, "en")}</td>
                  <td className="py-2.5 font-mono text-xs text-muted">{h.fileName}</td>
                  <td className="num py-2.5 text-right">{h.rowsOk}</td>
                  <td className={`num py-2.5 text-right ${h.rowsRejected ? "text-danger" : "text-faint"}`}>{h.rowsRejected}</td>
                  <td className="num py-2.5 text-right">{h.newlyOverdue}</td>
                  <td className="num py-2.5 text-right">{h.cured}</td>
                  <td className="px-5 py-2.5 text-right text-muted">{h.uploadedBy ? dateTime(h.createdAt.toISOString(), "en") : `Automatic · ${dateTime(h.createdAt.toISOString(), "en")}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
