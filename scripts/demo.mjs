// `npm run demo`: the whole app, production build, on http://localhost:3000, in one command.
import { spawnSync, spawn } from "node:child_process";

const run = (args) => {
  const r = spawnSync("npm", args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run(["run", "ensure-local"]);
console.log("› Building (about a minute the first time)…");
run(["run", "build", "--silent"]);
console.log(`
  Kisht is running on http://localhost:3000
  Sign in with any demo account (password kisht-demo-2026), e.g.
    Field officer        rahul@kisht.demo
    Branch manager       priya@kisht.demo
    Head of collections  meera@kisht.demo
  Press Ctrl-C to stop.
`);
const server = spawn("npm", ["run", "start", "--silent"], { stdio: "inherit", shell: process.platform === "win32" });
process.on("SIGINT", () => server.kill("SIGINT"));
server.on("exit", (code) => process.exit(code ?? 0));
