import { cookies } from "next/headers";
import { z } from "zod";
import { CLOCK_COOKIE } from "@/lib/clock";
import { demoMode } from "@/server/auth";
import { json, route } from "@/server/http";
import { IST_OFFSET_MIN } from "@/domain/time";

const body = z.object({ istTime: z.string().regex(/^\d{2}:\d{2}$/).nullable() });

// Demo only: shifts the app's clock so reviewers can see the 8 am to 7 pm rule at any hour.
export const POST = route(async (req: Request) => {
  if (!demoMode()) return json({ error: "not_found" }, 404);
  const { istTime } = body.parse(await req.json());
  const jar = await cookies();
  if (!istTime) {
    jar.delete(CLOCK_COOKIE);
    return json({ offsetMinutes: 0 });
  }
  const [h, m] = istTime.split(":").map(Number);
  const now = new Date();
  const istNowMin = (now.getUTCHours() * 60 + now.getUTCMinutes() + IST_OFFSET_MIN) % 1440;
  const offset = h * 60 + m - istNowMin;
  jar.set(CLOCK_COOKIE, String(offset), { path: "/", sameSite: "lax", maxAge: 12 * 3600 });
  return json({ offsetMinutes: offset });
});
