// Makes a fresh clone runnable with no manual steps: creates .env.local (demo mode, a random
// session secret) and builds the embedded database with demo data if it does not exist yet.
// Runs before `npm run dev` and `npm run demo`. Never touches a configured DATABASE_URL.
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const ENV = ".env.local";
if (!existsSync(ENV)) {
  const example = existsSync(".env.example") ? readFileSync(".env.example", "utf8") : "";
  const secret = randomBytes(32).toString("base64");
  writeFileSync(ENV, example.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${secret}`).replace(/^DEMO_MODE=.*$/m, "DEMO_MODE=true"));
  console.log("› Created .env.local (demo mode on, random session secret)");
} else if (!/^SESSION_SECRET=.+$/m.test(readFileSync(ENV, "utf8"))) {
  appendFileSync(ENV, `\nSESSION_SECRET=${randomBytes(32).toString("base64")}\n`);
  console.log("› Added a session secret to .env.local");
}

try {
  process.loadEnvFile(ENV);
} catch {}

if (!process.env.DATABASE_URL && !existsSync(".data/pglite/PG_VERSION")) {
  console.log("› No local database yet: creating it and loading demo data (about 5 s)…");
  const r = spawnSync("npm", ["run", "setup"], { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
