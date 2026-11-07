"use client";

import { useEffect } from "react";

// Shown when a page fails to load (for example, the database is unreachable). The officer app
// itself keeps working from its offline copy; this covers the server-rendered manager pages.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <img src="/icon.svg" alt="" className="size-10" />
      <h1 className="mt-6 text-xl font-semibold">Something went wrong</h1>
      <p className="mt-1 max-w-xs text-sm text-muted">This page could not be loaded. Check your connection and try again. Nothing you saved has been lost.</p>
      <div className="mt-6 flex gap-2">
        <button onClick={reset} className="inline-flex h-11 items-center rounded-xl bg-accent px-5 text-[15px] font-medium text-white hover:bg-accent-strong">
          Try again
        </button>
        <a href="/" className="inline-flex h-11 items-center rounded-xl border border-line px-5 text-[15px] font-medium hover:bg-surface">
          Home
        </a>
      </div>
    </main>
  );
}
