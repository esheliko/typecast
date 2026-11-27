#!/usr/bin/env node
/**
 * Real-UI performance measurement for Typecast.
 *   node scripts/perf.mjs --base https://typecast-three.vercel.app --runs 3 [--out <file.json>] [--only browse,search,episode,popups] [--phone]
 * A full run takes ~12 min. Compare like with like: a PR preview against a preview of main (preview domains add ~0.2 s per request), see docs/perf.md.
 * Env: SMOKE_EMAIL, SMOKE_PASSWORD (sign-in), PERF_HEADERS='{...}' (extra headers), PERF_SHARE=<_vercel_share token> (protected preview).
 * Run 1 is "cold" (first touch of each flow: cold lambdas/caches), runs 2..N are "warm".
 * Each flow: wall ms from the action to a specific selector being visible, plus every /api/*, document and RSC request
 * made during the flow (start/end offset from the action, duration, status, x-vercel-cache, server-timing).
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
const require = createRequire(process.env.PW_FROM || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"));
const { chromium } = require("playwright");
const argv = process.argv.slice(2);
const one = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const BASE = (one("base", "https://typecast-three.vercel.app")).replace(/\/$/, "");
const RUNS = Number(one("runs", 3));
const OUT = one("out", path.join(os.tmpdir(), "typecast-perf.json"));
const ONLY = one("only", "") ? one("only").split(",") : null;
const phone = argv.includes("--phone");
for (const v of ["SMOKE_EMAIL", "SMOKE_PASSWORD"]) if (!process.env[v]) { console.error(`${v} not set`); process.exit(2); }
const EXTRA = process.env.PERF_HEADERS ? JSON.parse(process.env.PERF_HEADERS) : null;
const TO = 45_000;

const browser = await chromium.launch({ args: ["--no-sandbox"], executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1100, height: 900 }, ...(phone ? { isMobile: true, hasTouch: true } : {}), ...(EXTRA ? { extraHTTPHeaders: EXTRA } : {}) });
const page = await ctx.newPage();

// ---- request recorder -------------------------------------------------------------------------
let rec = null; // { t0, reqs: [] }
const interesting = (r) => {
  const u = new URL(r.url());
  if (u.origin !== BASE) return false;
  return u.pathname.startsWith("/api/") || r.resourceType() === "document" || u.searchParams.has("_rsc") || !!r.headers()["rsc"];
};
const pending = new Map();
page.on("request", (r) => { if (rec && interesting(r)) pending.set(r, { s: Date.now() - rec.t0 }); });
page.on("requestfinished", async (r) => {
  const p = pending.get(r); if (!p || !rec) return; pending.delete(r);
  const mine = rec; const e = Date.now() - mine.t0;
  let status = null, cache = null, st = null;
  try { const res = await r.response(); status = res.status(); const h = res.headers(); cache = h["x-vercel-cache"] ?? null; st = h["server-timing"] ?? null; } catch {}
  const tm = r.timing();
  const u = new URL(r.url());
  const kind = u.searchParams.has("_rsc") || r.headers()["rsc"] ? "rsc" : r.resourceType() === "document" ? "doc" : "api";
  const q = [...u.searchParams].filter(([k]) => k !== "_rsc").map(([k, v]) => `${k}=${v}`).join("&");
  mine.reqs.push({ kind, req: `${u.pathname}${q ? "?" + q : ""}`, status, cache, serverTiming: st, start: p.s, end: e, ms: e - p.s,
    ttfb: tm.responseStart >= 0 ? Math.round(tm.responseStart - Math.max(tm.requestStart, 0)) : null });
});
page.on("requestfailed", (r) => { const p = pending.get(r); if (p && rec) { pending.delete(r); rec.reqs.push({ kind: "api", req: new URL(r.url()).pathname + " (FAILED " + (r.failure()?.errorText ?? "") + ")", status: 0, start: p.s, end: Date.now() - rec.t0, ms: Date.now() - rec.t0 - p.s }); } });

const settle = async () => { await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {}); await new Promise((r) => setTimeout(r, 150)); };

/** Time `action` (starts the clock) until `waitFor` resolves. marks: extra named waits timed from the same start. */
async function timed(name, action, waitFor, marks = {}) {
  rec = { t0: Date.now(), reqs: [] };
  const t0 = performance.now();
  const out = { name, ok: true, ms: null, marks: {}, reqs: [] };
  try {
    await action();
    const mk = Object.entries(marks).map(([k, f]) => f().then(() => { out.marks[k] = Math.round(performance.now() - t0); }).catch(() => {}));
    await waitFor();
    out.ms = Math.round(performance.now() - t0);
    await Promise.all(mk);
  } catch (e) { out.ok = false; out.error = String(e).split("\n")[0]; out.ms = Math.round(performance.now() - t0); }
  await settle(); // let trailing requests land (not in ms)
  out.reqs = rec.reqs.sort((a, b) => a.start - b.start).map((q) => ({ ...q, late: q.start >= out.ms })); /* late = started after the flow's wait finished (background prefetch, imdb badges, glimpse) */ rec = null; pending.clear();
  return out;
}
const vis = (sel, n = 0) => () => page.locator(sel).nth(n).waitFor({ state: "visible", timeout: TO });
const go = (p) => () => page.goto(BASE + p, { waitUntil: "commit" });
const GRID = 'section[aria-label="Browse"] ul.grid li a[href^="/title/"]';

// ---- sign in (once) -----------------------------------------------------------------------------
if (process.env.PERF_SHARE) await page.goto(BASE + "/?_vercel_share=" + process.env.PERF_SHARE);
await page.goto(BASE + "/login");
await page.getByLabel("Email").fill(process.env.SMOKE_EMAIL);
await page.getByLabel("Password").fill(process.env.SMOKE_PASSWORD);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 });
await settle();

// ---- flows ---------------------------------------------------------------------------------------
const CONN = ["tom hanks + meg ryan", "pulp fiction + reservoir dogs", "sheldon + penny"];
const search = () => page.locator('input[type="search"]:visible').first();
const flows = {
  // 1. Browse
  async browse() {
    const r = [];
    r.push(await timed("browse: load / (first poster)", go("/"), vis(GRID)));
    // switch away then back to For you (client-side list switch)
    r.push(await timed("browse: switch to Trending", () => page.getByRole("button", { name: "Trending", exact: true }).click(), async () => { await page.locator('.chips button[aria-pressed="true"]', { hasText: "Trending" }).waitFor(); await page.locator(GRID).first().waitFor({ state: "visible", timeout: TO }); await page.waitForFunction(() => !document.querySelector('section[aria-label="Browse"] .pc-img.sk'), null, { timeout: TO }); }));
    r.push(await timed("browse: switch to For you", () => page.getByRole("button", { name: "For you", exact: true }).click(), async () => { await page.locator('.chips button[aria-pressed="true"]', { hasText: "For you" }).waitFor(); await page.waitForFunction(() => !document.querySelector('section[aria-label="Browse"] .pc-img.sk') && document.querySelectorAll('section[aria-label="Browse"] ul.grid li a').length > 0, null, { timeout: TO }); }));
    r.push(await timed("browse: reload ?list=foryou (For you results)", async () => { await page.goto(BASE + "/?list=foryou", { waitUntil: "commit" }); }, vis(GRID, 5)));
    for (const [lbl, label] of [["Popular", "Popular"], ["Top rated", "Top rated"], ["Coming soon", "Coming soon"]]) {
      r.push(await timed(`browse: switch to ${lbl}`, () => page.getByRole("button", { name: label, exact: true }).click(), async () => { await page.locator('.chips button[aria-pressed="true"]', { hasText: label }).waitFor(); await page.waitForFunction(() => !document.querySelector('section[aria-label="Browse"] .pc-img.sk') && document.querySelectorAll('section[aria-label="Browse"] ul.grid li a').length > 0, null, { timeout: TO }); }));
    }
    return r;
  },
  // 2. Search
  async search() {
    const r = [];
    await page.goto(BASE + "/", { waitUntil: "load" }); await settle();
    r.push(await timed('search: plain title "inception"', async () => { await search().fill("inception"); }, vis('a[href="/title/movie/27205"]')));
    await search().fill(""); await settle();
    for (const q of CONN) {
      await page.goto(BASE + "/", { waitUntil: "load" }); await settle();
      r.push(await timed(`search: connection "${q}"`, async () => { await search().fill(q); }, async () => {
        await page.locator(".pair-answer").waitFor({ state: "visible", timeout: TO });
        await page.waitForFunction(() => { const p = document.querySelector(".pair-answer"); return p && !p.querySelector(".spin") && (p.querySelector(".conn-row, .rows, .card, a[href^='/title/'], a[href^='/person/']") || /No connection/.test(p.textContent || "")); }, null, { timeout: TO });
      }, { "first-block": () => page.locator(".pair-answer .card, .pair-answer a[href^='/title/'], .pair-answer a[href^='/person/']").first().waitFor({ state: "visible", timeout: TO }) }));
    }
    return r;
  },
  // 3. Episode cast
  async episode() {
    const r = [];
    for (const [id, label] of [[1396, "Breaking Bad"], [1399, "Game of Thrones"]]) {
      r.push(await timed(`episodes: ${label} (tv ${id}) page load -> season faces`, go(`/title/tv/${id}`), async () => { await vis(".eps")(); await page.locator(".ep-list .epf .epf-txt, .ep-list .epf-hid").first().waitFor({ state: "visible", timeout: TO }); },
        { "episode-list": () => page.locator(".ep-list .ep-row").first().waitFor({ state: "visible", timeout: TO }) }));
      // switch season (client side): second season button
      r.push(await timed(`episodes: ${label} switch season -> faces`, async () => { const b = page.locator(".ep-seasons button.chip:not([aria-pressed=true])").first(); await b.click(); }, async () => {
        await page.waitForFunction(() => document.querySelectorAll(".ep-list .epf .epf-txt").length > 0, null, { timeout: TO });
      }));
      r.push(await timed(`episodes: ${label} open an episode (guest list; ms = /api/episode enrichment done)`, async () => { await page.locator(".ep-list .ep-row").nth(1).click(); }, async () => {
        await page.waitForResponse((r) => r.url().includes("/api/episode"), { timeout: TO });
        await page.waitForTimeout(50);
      }, { "panel+guests": () => page.locator(".ep-panel .credits .credit").first().waitFor({ state: "visible", timeout: TO }) }));
    }
    // "Cast by season" (/api/season-cast) on the title's cast part, when present
    r.push(await timed("episodes: Game of Thrones 'Cast by season' -> season cast", async () => {
      await page.goto(BASE + "/title/tv/1399", { waitUntil: "load" });
      const s = page.locator("summary", { hasText: "Cast by season" }).first(); await s.waitFor({ state: "visible", timeout: TO }); await s.click();
      await page.locator("details.cw button", { hasText: "Season 2" }).first().click();
    }, async () => { await page.waitForFunction(() => { const d = [...document.querySelectorAll("details.cw")].find((x) => /Cast by season/.test(x.textContent || "")); return d && d.querySelectorAll(".credits .credit").length > 0 && !d.querySelector(".spin"); }, null, { timeout: TO }); }));
    return r;
  },
  // 4. Popups + pages
  async popups() {
    const r = [];
    await page.goto(BASE + "/", { waitUntil: "load" }); await vis(GRID)(); await settle();
    r.push(await timed("popup: open title from Browse grid (cast visible)", async () => { await page.locator(GRID).first().click(); }, vis('[role="dialog"] a[href^="/person/"]'), { "dialog-shell": () => page.locator('[role="dialog"]').waitFor({ state: "visible", timeout: TO }) }));
    r.push(await timed("popup: open person from title popup (credits visible)", async () => { await page.locator('[role="dialog"] a[href^="/person/"]').first().click(); }, async () => { await page.locator('[role="dialog"][aria-label="Person details"] a[href^="/title/"]').nth(2).waitFor({ state: "visible", timeout: TO }); }));
    await page.keyboard.press("Escape"); await settle();
    r.push(await timed("page: /watching", go("/watching"), async () => { await page.waitForFunction(() => /what are you watching|watching now/i.test(document.body.innerText) && !document.querySelector(".sk"), null, { timeout: TO }); }));
    r.push(await timed("page: /library", go("/library"), async () => { await vis("h1")(); await page.waitForFunction(() => !document.querySelector(".sk") && (document.querySelector('a[href^="/title/"]') || /nothing|empty|no titles/i.test(document.body.innerText)), null, { timeout: TO }); }));
    return r;
  },
};

// ---- run -----------------------------------------------------------------------------------------
const results = { base: BASE, when: new Date().toISOString(), runs: RUNS, viewport: phone ? "phone" : "desktop", flows: [] };
for (let run = 1; run <= RUNS; run++) {
  for (const [fname, fn] of Object.entries(flows)) {
    if (ONLY && !ONLY.includes(fname)) continue;
    let steps;
    try { steps = await fn(); } catch (e) { steps = [{ name: `${fname}: FLOW ERROR`, ok: false, error: String(e).split("\n")[0], ms: null, reqs: [] }]; }
    for (const s of steps) results.flows.push({ run, group: fname, ...s });
    console.error(`run ${run} ${fname}: ${steps.map((s) => (s.ok ? s.ms : "ERR")).join(" ")}`);
  }
}
await browser.close();
writeFileSync(OUT, JSON.stringify(results, null, 1));

// ---- summary ---------------------------------------------------------------------------------------
const med = (a) => { a = a.filter((x) => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2) + ((a.length % 2 === 0) ? 0 : 0)] : null; };
const names = [...new Set(results.flows.map((f) => f.name))];
const pad = (s, n) => String(s).padEnd(n);
console.log(pad("flow", 74) + pad("cold ms", 9) + pad("warm med", 9) + "warm all");
for (const n of names) {
  const rows = results.flows.filter((f) => f.name === n);
  const cold = rows.find((f) => f.run === 1), warm = rows.filter((f) => f.run > 1);
  console.log(pad(n, 74) + pad(cold?.ok ? cold.ms : "ERR", 9) + pad(med(warm.filter((w) => w.ok).map((w) => w.ms)) ?? "-", 9) + warm.map((w) => (w.ok ? w.ms : "ERR")).join(","));
}
console.log("\nSlowest requests per flow (cold run / worst of warm runs): path, ms, calls, start->end offset");
for (const n of names) {
  const rows = results.flows.filter((f) => f.name === n);
  const agg = new Map();
  for (const f of rows) for (const q of f.reqs.filter((x) => !x.late)) { const a = agg.get(q.req) ?? { n: 0, ms: [], cache: new Set(), runs: new Set(), kind: q.kind }; a.n++; a.ms.push(q.ms); if (q.cache) a.cache.add(q.cache); a.runs.add(f.run); agg.set(q.req, a); }
  const top = [...agg].sort((a, b) => Math.max(...b[1].ms) - Math.max(...a[1].ms)).slice(0, 3);
  console.log(`- ${n}\n` + top.map(([p, a]) => `    ${Math.max(...a.ms)}ms (med ${med(a.ms)}) x${a.n}/${rows.length} runs [${a.kind}] ${p.slice(0, 110)} ${[...a.cache].join("/")}`).join("\n"));
}
console.log(`\nraw: ${OUT}`);
