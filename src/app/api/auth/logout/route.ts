import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/sessionToken";
import { json, route } from "@/server/http";

export const POST = route(async () => {
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
});
