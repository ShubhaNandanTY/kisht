import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/db/schema";

// Edge-safe (no Node APIs): used by middleware and by route handlers.
export const SESSION_COOKIE = "kisht_session";
export const SESSION_TTL_S = 7 * 24 * 3600; // a week, so an officer offline all day is not logged out mid-shift

export type Session = { sub: string; role: Role; branchId: string | null; name: string };

function key(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
    return new TextEncoder().encode("local-development-only-session-key");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ role: s.role, branchId: s.branchId, name: s.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_S}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.role !== "string") return null;
    return { sub: payload.sub, role: payload.role as Role, branchId: (payload.branchId as string | null) ?? null, name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}
