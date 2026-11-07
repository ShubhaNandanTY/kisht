// Skeleton while a manager page loads its data on the server.
export function ManagerSkeleton() {
  return (
    <div className="animate-pulse" role="status" aria-busy="true">
      <h1 className="sr-only">Loading…</h1>
      <div className="h-7 w-48 rounded-lg bg-line" />
      <div className="mt-2 h-4 w-80 max-w-full rounded bg-line/70" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl border border-line bg-white" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="h-72 rounded-2xl border border-line bg-white" />
        <div className="h-72 rounded-2xl border border-line bg-white" />
      </div>
    </div>
  );
}
