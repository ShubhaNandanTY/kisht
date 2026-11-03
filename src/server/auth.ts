import { cookies } from "next/headers";
import type { Role } from "@/db/schema";
import { SESSION_COOKIE, verifySession, type Session } from "@/lib/sessionToken";
import { CLOCK_COOKIE, parseOffset } from "@/lib/clock";

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export async function requireSession(roles?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new ApiError(401, "unauthenticated");
  if (roles && !roles.includes(s.role)) throw new ApiError(403, "forbidden");
  return s;
}

/** Branch a manager may see. Head of collections may pick any (or all = null). */
export function branchScope(s: Session, requested?: string | null): string | null {
  if (s.role === "head") return requested && requested !== "ALL" ? requested : null;
  if (s.role === "manager") return s.branchId;
  throw new ApiError(403, "forbidden");
}

export const demoMode = () => process.env.DEMO_MODE === "true";

export async function serverNow(): Promise<Date> {
  if (!demoMode()) return new Date();
  const jar = await cookies();
  return new Date(Date.now() + parseOffset(jar.get(CLOCK_COOKIE)?.value) * 60_000);
}

export async function getLang(fallback: "hi" | "en" = "en"): Promise<"hi" | "en"> {
  const v = (await cookies()).get("kisht_lang")?.value;
  return v === "hi" || v === "en" ? v : fallback;
}
