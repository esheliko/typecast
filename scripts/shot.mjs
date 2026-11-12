#!/usr/bin/env node
/**
 * One command to screenshot a page of the signed-in app, for the "Screenshot complaints" rule in CLAUDE.md.
 *
 *   node scripts/shot.mjs "/watching?k=tv-79744&s=3&e=8" --click "Brent Huff" --sel "section:has-text('episodes of')" --out /tmp/here.png
 *
 * Flags: --out FILE (default shot.png in the scratchpad or /tmp)   --phone (390x844, default laptop-ish 820x900; or --w N --h N)
 *        --click TEXT (repeatable: click the element with this exact text, in order)   --sel CSS (screenshot only that element)
 *        --mock 'GLOB={json}' (repeatable, fake an API answer)   --scroll PX (scroll the Finder list first)   --full (whole page)   --wait MS (extra settle time, default 1500)   --text TEXT (wait until the page shows it)
 * It builds if .next is missing or older than src, starts `next start` on :3199 if SMOKE_BASE_URL is unset (and stops it after),
 * signs in with SMOKE_EMAIL / SMOKE_PASSWORD, and prints the file path. Then send it with SendUserFile. Needs the smoke env (see CLAUDE.md).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const vals = (n) => argv.flatMap((a, i) => (a === `--${n}` ? [argv[i + 1]] : []));
const one = (n, d) => vals(n)[0] ?? d;
const route = argv.find((a, i) => a.startsWith("/") && !(argv[i - 1] || "").startsWith("--")) ?? "/library";
const phone = flag("phone");
const W = Number(one("w", phone ? 390 : 820)), H = Number(one("h", phone ? 844 : 900));
const out = one("out", path.join(process.env.CLAUDE_SCRATCHPAD || "/tmp", "shot.png"));
for (const v of ["SMOKE_EMAIL", "SMOKE_PASSWORD"]) if (!process.env[v]) { console.error(`${v} is not set; cannot sign in.`); process.exit(2); }

const newest = (d) => readdirSync(d, { withFileTypes: true }).reduce((m, e) => Math.max(m, e.isDirectory() ? newest(path.join(d, e.name)) : statSync(path.join(d, e.name)).mtimeMs), 0);
let base = process.env.SMOKE_BASE_URL, server = null;
if (!base) {
  base = "http://localhost:3199";
  const built = existsSync(".next/BUILD_ID") ? statSync(".next/BUILD_ID").mtimeMs : 0;
  if (!built || built < newest("src")) { console.error("building..."); if (spawnSync("npm", ["run", "build"], { stdio: "ignore" }).status) { console.error("build failed"); process.exit(1); } }
  // Node's fetch only uses the sandbox proxy with these two set; without them TMDB calls fail and pages say "Couldn't load".
  server = spawn("npx", ["next", "start", "-p", "3199"], { stdio: "ignore", env: { ...process.env, NODE_USE_ENV_PROXY: "1", NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS || "/root/.ccr/ca-bundle.crt" } });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + "/login")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
}
const done = (code) => { server?.kill(); process.exit(code); };
try {
  const chrome = process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  const b = await chromium.launch({ executablePath: chrome, args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  // --mock 'GLOB={json}' (repeatable): answer matching requests with that JSON, e.g. to show UI that needs a service the sandbox lacks.
  for (const m of vals("mock")) { const i = m.indexOf("="); await ctx.route(m.slice(0, i), (r) => r.fulfill({ contentType: "application/json", body: m.slice(i + 1) })); }
  await page.goto(base + "/login");
  await page.getByLabel("Email").fill(process.env.SMOKE_EMAIL);
  await page.getByLabel("Password").fill(process.env.SMOKE_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  await page.goto(base + route);
  await page.waitForLoadState("networkidle").catch(() => {});
  for (const t of vals("click")) { await page.getByText(t, { exact: true }).first().click({ timeout: 30_000 }); await page.waitForTimeout(800); }
  if (one("scroll")) { await page.locator(".wx-left").evaluate((e, y) => { e.scrollTop = y; }, Number(one("scroll"))); await page.waitForTimeout(600); }
  for (const t of vals("text")) await page.getByText(t).first().waitFor({ timeout: 40_000 });
  await page.waitForTimeout(Number(one("wait", 1500)));
  if (one("sel")) { const el = page.locator(one("sel")).first(); await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: out }); }
  else await page.screenshot({ path: out, fullPage: flag("full") });
  await b.close();
  console.log(out);
  done(0);
} catch (e) { console.error(String(e).split("\n")[0]); done(1); }
