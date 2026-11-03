import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { branches } from "@/db/schema";
import { demoMode, getSession } from "@/server/auth";
import { ManagerNav } from "./ManagerNav";

export const dynamic = "force-dynamic";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s || s.role === "officer") redirect("/login");
  const all = await db.select().from(branches).orderBy(asc(branches.name));
  return (
    <div className="min-h-dvh bg-surface lg:flex">
      <ManagerNav name={s.name} role={s.role} branchId={s.branchId} branches={all.map((b) => ({ id: b.id, name: b.name }))} demo={demoMode()} />
      <main className="min-w-0 flex-1 px-4 pt-4 pb-16 sm:px-6 lg:px-10 lg:pt-8">{children}</main>
    </div>
  );
}
