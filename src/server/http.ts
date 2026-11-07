import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./auth";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Wraps a route handler: maps auth and validation failures to clean JSON errors and hides internals. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return json({ error: err.code }, err.status);
      if (err instanceof SyntaxError) return json({ error: "invalid_json" }, 400);
      if (err instanceof ZodError) return json({ error: "invalid_input", issues: err.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
      console.error(err);
      return json({ error: "server_error" }, 500);
    }
  };
}
