import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

// With DATABASE_URL we talk to a real Postgres (Neon on Vercel). Without it we run an
// embedded Postgres (PGlite) on disk, so the app runs locally with no database install.
// Both are Postgres, so the schema, migrations and queries are identical.
function create(): DB {
  const url = process.env.DATABASE_URL;
  if (url) {
    const client = postgres(url, { max: 5, prepare: false });
    return drizzlePostgres(client, { schema });
  }
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  // PGlite writes to local files; closing it on Ctrl-C keeps them consistent.
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, () => {
      client.close().finally(() => process.exit(0));
    });
  }
  return drizzlePglite(client, { schema }) as unknown as DB;
}

const globalForDb = globalThis as unknown as { __kishtDb?: DB };

export const db: DB = globalForDb.__kishtDb ?? (globalForDb.__kishtDb = create());
export { schema };
