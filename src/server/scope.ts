import { redirect } from "next/navigation";
import { branchScope, getSession } from "./auth";

/** For manager pages: the branch this user may see (null = all branches, head only). */
export async function pageScope(searchParams: Promise<{ branch?: string }>) {
  const s = await getSession();
  if (!s || s.role === "officer") redirect("/login");
  const { branch } = await searchParams;
  return { session: s, branchId: branchScope(s, branch ?? null) };
}
