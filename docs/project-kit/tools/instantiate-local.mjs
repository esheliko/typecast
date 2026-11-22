#!/usr/bin/env node
// Fills the kit's placeholders into a fresh folder, exactly like scripts/bootstrap.mjs does after the services exist, but with fake ids and no network.
// Used to prove the kit still produces a project that installs, lints, typechecks, tests and builds.
//   node docs/project-kit/tools/instantiate-local.mjs <out-dir> ["Display Name"] ["purpose sentence"]
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATE_ONLY, leftover, slugify, substitute } from '../template/scripts/bootstrap-core.mjs';

const [out, name = 'Sample App', purpose = 'A sample project used to check the kit.'] = process.argv.slice(2);
if (!out) { console.error('usage: instantiate-local.mjs <out-dir> [name] [purpose]'); process.exit(2); }
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
cpSync(new URL('../template', import.meta.url).pathname, out, { recursive: true });
for (const p of TEMPLATE_ONLY) rmSync(join(out, p), { recursive: true, force: true });
const vars = { NAME: name, SLUG: slugify(name), REPO: `owner/${slugify(name)}`, PURPOSE: purpose, REPO_ID: 1, VERCEL_PROJECT_ID: 'prj_test', VERCEL_TEAM_ID: 'team_test', TODAY: new Date().toISOString().slice(0, 10) };
const left = new Set();
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    const t = readFileSync(p, 'utf8'), o = substitute(t, vars);
    leftover(o).forEach((k) => left.add(k));
    if (o !== t) writeFileSync(p, o);
  }
})(out);
if (left.size) { console.error(`unfilled placeholders: ${[...left].join(', ')}`); process.exit(1); }
console.log(`generated ${out}`);
