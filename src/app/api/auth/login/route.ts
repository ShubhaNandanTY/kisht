import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db/client";
import { auditLog, users } from "@/db/schema";
import { SESSION_COOKIE, SESSION_TTL_S, signSession } from "@/lib/sessionToken";
import { json, route } from "@/server/http";

const body = z.object({ email: z.string().trim().toLowerCase().email().max(120), password: z.string().min(1).max(200) });

// Per-instance throttle: 5 failures per email+IP per 15 minutes. A shared store (Redis) would replace this at scale.
const failures = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 15 * 60_000;
// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("no-such-user-password", 10);

export const POST = route(async (req: Request) => {
  const { email, password } = body.parse(await req.json());
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${email}|${ip}`;
  const f = failures.get(key);
  if (f && f.n >= 5 && f.until > Date.now()) return json({ error: "throttled" }, 429);

  const [user] = await db.select().from(users).where(eq(users.email, email));
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) {
    failures.set(key, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + WINDOW_MS });
    return json({ error: "invalid_credentials" }, 401);
  }
  failures.delete(key);
  const token = await signSession({ sub: user.id, role: user.role, branchId: user.branchId, name: user.name });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_S });
  jar.set("kisht_lang", user.locale, { sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  await db.insert(auditLog).values({ userId: user.id, action: "login", entity: "users", entityId: user.id });
  return json({ role: user.role, locale: user.locale });
});
