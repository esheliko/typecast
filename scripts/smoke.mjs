// `npm run smoke`: the same shape CI uses. One `next start` server, then the `core` project (behaviour + smoke, writes to the shared
// test user, one worker) and the `visual` project (read-only, SMOKE_SKIP_SETUP=1) at the same time. Run one after the other this took
// the sum of both (6+ min); together it is the longer of the two. With extra arguments (`npm run smoke -- -g "Library"`) it runs
// plain `playwright test <args>` as before. SMOKE_BASE_URL tests an already-running site and starts no server.
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const bin = (c) => (process.platform === "win32" ? `${c}.cmd` : c);
const run = (cmd, a, env = {}, tag = "") => {
  const p = spawn(bin(cmd), a, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const pipe = (s, out) => { let buf = ""; s.on("data", (d) => { buf += d; const lines = buf.split("\n"); buf = lines.pop(); for (const l of lines) out.write(tag ? `[${tag}] ${l}\n` : `${l}\n`); }); };
  pipe(p.stdout, process.stdout); pipe(p.stderr, process.stderr);
  return p;
};
const done = (p) => new Promise((res) => p.on("close", (code) => res(code ?? 1)));

if (args.length) {
  process.exit(await done(run("npx", ["playwright", "test", ...args])));
}

let server;
let base = process.env.SMOKE_BASE_URL;
if (!base) {
  const port = process.env.SMOKE_PORT || "3100";
  base = `http://localhost:${port}`;
  const up = () => fetch(`${base}/login`).then((r) => r.ok, () => false);
  if (!(await up())) {
    // Node's fetch ignores HTTPS_PROXY unless told otherwise. Behind a proxy (cloud sessions) every TMDB call then fails ("Cannot reach TMDB"),
    // every page 502s and each test burns its timeouts: a run that takes ~4 min takes 10+. NODE_USE_ENV_PROXY makes the server use the proxy.
    const viaProxy = process.env.HTTPS_PROXY || process.env.https_proxy ? { NODE_USE_ENV_PROXY: "1" } : {};
    server = run("npx", ["next", "start", "-p", port], viaProxy, "server");
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) { await new Promise((r) => setTimeout(r, 1000)); ok = await up(); }
    if (!ok) { server.kill(); console.error("smoke: the server did not come up (run `npm run build` first)"); process.exit(1); }
  }
}
const env = { SMOKE_BASE_URL: base };
const core = run("npx", ["playwright", "test", "--project=core"], env, "core");
const visual = run("npx", ["playwright", "test", "--project=visual"], { ...env, SMOKE_SKIP_SETUP: "1" }, "visual");
const codes = await Promise.all([done(core), done(visual)]);
server?.kill();
process.exit(codes.some((c) => c !== 0) ? 1 : 0);
