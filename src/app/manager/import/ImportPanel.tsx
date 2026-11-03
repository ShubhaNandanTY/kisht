"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Spinner } from "@/components/ui";
import { Card } from "@/components/Card";
import type { ImportSummary } from "@/server/imports";

const ERRORS: Record<string, string> = {
  older_than_latest: "This date is older than the latest import. History can't be rewound; import today's file instead.",
  file_too_large: "The file is over 5 MB.",
  too_many_rows: "The file has more than 20,000 rows.",
  no_valid_rows: "No row in the file passed validation.",
  not_csv: "Choose a .csv file.",
  bad_date: "Pick today or an earlier date.",
  no_file: "Choose a file first.",
};

export function ImportPanel({ today, latest }: { today: string; latest: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState<"upload" | "mock" | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [drag, setDrag] = useState(false);

  async function upload(allowPartial = false) {
    if (!file) return;
    setBusy("upload");
    const form = new FormData();
    form.append("file", file);
    form.append("asOfDate", date);
    if (allowPartial) form.append("allowPartial", "true");
    await finish(fetch("/api/manager/import", { method: "POST", body: form }));
  }
  async function pull() {
    setBusy("mock");
    await finish(fetch("/api/manager/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "mock" }) }));
  }
  async function finish(p: Promise<Response>) {
    try {
      const r = await p;
      const data = (await r.json()) as ImportSummary | { error: string };
      setResult("ok" in data ? data : { ok: false, error: (data as { error: string }).error });
      if (r.ok) router.refresh();
    } catch {
      setResult({ ok: false, error: "network" });
    } finally {
      setBusy(null);
    }
  }

  const fatal = (e: string) =>
    e.startsWith("partial_file:")
      ? `This file has only ${e.split(":")[1]} valid loans, but ${e.split(":")[2]} are overdue today. Loans missing from the file are treated as paid up, so importing it would clear most officers' lists. Check the export is complete.`
      : e.startsWith("missing_columns:") ? `Missing required columns: ${e.slice(16).replaceAll(",", ", ")}` : (ERRORS[e] ?? "The import failed. Nothing was changed.");

  return (
    <Card title="Import a file">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          setFile(e.dataTransfer.files[0] ?? null);
        }}
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${drag ? "border-accent bg-accent-soft" : "border-line"}`}
      >
        <p className="font-medium">{file ? file.name : "Drop the overdue CSV here"}</p>
        <p className="mt-1 text-sm text-muted">{file ? `${(file.size / 1024).toFixed(0)} KB` : "or"}</p>
        <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button size="sm" className="mt-3" onClick={() => input.current?.click()}>
          {file ? "Choose another" : "Choose file"}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs text-muted">File date</span>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="mt-1 h-11 rounded-xl border border-line px-3" />
        </label>
        <Button variant="primary" disabled={!file || !!busy} onClick={() => upload()}>
          {busy === "upload" && <Spinner />}
          Import file
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="max-w-md text-sm text-muted">
          Or pull today&apos;s file straight from the loan system (mocked here). Latest file: {latest ?? "none"}.{" "}
          <a href="/api/manager/import/file" className="text-accent">
            Download it
          </a>{" "}
          to inspect or edit first.
        </p>
        <Button disabled={!!busy} onClick={pull}>
          {busy === "mock" && <Spinner />}
          Pull from loan system
        </Button>
      </div>

      {result && (
        <div className="animate-fade mt-6" role="status">
          {!result.ok ? (
            <div className="rounded-xl bg-danger-soft p-4 text-sm text-danger">
              {fatal(result.error)}
              {result.error.startsWith("partial_file:") && (
                <div className="mt-3">
                  <Button size="sm" variant="danger" disabled={!!busy} onClick={() => upload(true)}>
                    Import anyway
                  </Button>
                </div>
              )}
              {result.errors && result.errors.length > 0 && <ErrorTable errors={result.errors} />}
            </div>
          ) : (
            <div className="rounded-xl bg-accent-soft p-4 text-sm">
              <p className="font-medium text-accent-strong">
                Imported {result.imported} of {result.total} rows for {result.asOfDate}.
              </p>
              <p className="mt-1 text-muted">
                {result.newlyOverdue} newly overdue · {result.cured} paid up · {result.npa} NPA · {result.reassigned} reassigned · promises {result.promisesKept} kept, {result.promisesBroken} broken
              </p>
              {result.errors.length > 0 && (
                <>
                  <p className="mt-3 font-medium text-danger">{result.rejected} rows skipped:</p>
                  <ErrorTable errors={result.errors} />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ErrorTable({ errors }: { errors: { row: number; loanId?: string; message: string }[] }) {
  return (
    <div className="mt-2 max-h-56 overflow-y-auto rounded-lg bg-white">
      <table className="w-full text-xs text-ink">
        <tbody className="divide-y divide-line">
          {errors.slice(0, 100).map((e, i) => (
            <tr key={i}>
              <td className="num w-16 px-3 py-1.5 whitespace-nowrap text-muted">Line {e.row}</td>
              <td className="w-24 py-1.5 font-mono">{e.loanId ?? "–"}</td>
              <td className="px-3 py-1.5">{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
