import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/sessionToken";

// Page-level guard. API routes check the session and role themselves (and return JSON, not redirects).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const home = session?.role === "officer" ? "/officer" : "/manager";

  if (pathname === "/" || pathname === "/login") {
    if (session) return NextResponse.redirect(new URL(home, req.url));
    return pathname === "/" ? NextResponse.redirect(new URL("/login", req.url)) : NextResponse.next();
  }
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  if (pathname.startsWith("/manager") && session.role === "officer") return NextResponse.redirect(new URL("/officer", req.url));
  if (pathname.startsWith("/officer") && session.role !== "officer") return NextResponse.redirect(new URL("/manager", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/", "/login", "/officer/:path*", "/manager/:path*"] };
