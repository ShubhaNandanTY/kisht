"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DemoClock } from "@/components/DemoClock";

const LINKS = [
  ["/manager", "Overview"],
  ["/manager/team", "Team & lists"],
  ["/manager/promises", "Promises"],
  ["/manager/import", "Daily import"],
  ["/manager/model", "Priority model"],
] as const;

export function ManagerNav({
  name,
  role,
  branchId,
  branches,
  demo,
}: {
  name: string;
  role: string;
  branchId: string | null;
  branches: { id: string; name: string }[];
  demo: boolean;
}) {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const branch = params.get("branch") ?? "ALL";
  const q = role === "head" && branch !== "ALL" ? `?branch=${branch}` : "";
  const active = (href: string) => (href === "/manager" ? path === href : path.startsWith(href));

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside className="border-b border-line bg-white lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between px-4 py-3 lg:block lg:px-5 lg:py-6">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" className="size-7" />
          <span className="font-semibold">Kisht</span>
        </div>
        <div className="text-right lg:mt-6 lg:text-left">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted">
            {role === "head" ? "Head of collections" : `Branch manager · ${branches.find((b) => b.id === branchId)?.name ?? ""}`}
          </p>
        </div>
      </div>

      {role === "head" && (
        <div className="px-4 pb-3 lg:px-5">
          <label className="sr-only" htmlFor="branch">
            Branch
          </label>
          <select
            id="branch"
            value={branch}
            onChange={(e) => router.push(`${path}${e.target.value === "ALL" ? "" : `?branch=${e.target.value}`}`)}
            className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm"
          >
            <option value="ALL">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:px-3 lg:pb-0" aria-label="Manager">
        {LINKS.map(([href, label]) => (
          <Link
            key={href}
            href={`${href}${q}`}
            aria-current={active(href) ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm whitespace-nowrap ${active(href) ? "bg-surface font-medium text-ink" : "text-muted hover:text-ink"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="hidden space-y-3 px-5 pt-8 lg:block">
        {demo && <DemoClock />}
        <button onClick={signOut} className="text-sm text-muted hover:text-ink">
          Sign out
        </button>
      </div>
      <div className="flex justify-end px-4 pb-2 lg:hidden">
        <button onClick={signOut} className="text-xs text-muted">
          Sign out
        </button>
      </div>
    </aside>
  );
}
