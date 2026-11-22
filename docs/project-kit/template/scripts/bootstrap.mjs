#!/usr/bin/env node
// Creates a complete new project from this kit, with no manual step. Run by .github/workflows/new-project.yml (workflow_dispatch) in the kit repo.
//   node scripts/bootstrap.mjs --name "My App" --slug my-app --purpose "..." [--visibility private] [--region ap-south-1] [--dry-run] [--no-verify]
// Needs (kit repo secrets, set once): KIT_GH_TOKEN (PAT: administration, contents, workflows, secrets, issues on the new repo; "repo"+"workflow" classic scopes also work),
// VERCEL_TOKEN, VERCEL_TEAM_ID, SUPABASE_ACCESS_TOKEN, SUPABASE_ORG_ID, KIT_OWNER_EMAIL. Secret values are never printed.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LABELS, TEMPLATE_ONLY, VERCEL_REGION, leftover, secretNames, slugify, startIssues, substitute, validateInputs, vercelEnv } from './bootstrap-core.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const DRY = flag('dry-run');
const name = arg('name'), purpose = arg('purpose');
const slug = arg('slug') || slugify(name ?? '');
const visibility = arg('visibility', 'private'), region = arg('region', 'ap-south-1');
const problems = validateInputs({ name, slug, purpose, visibility, region });
if (problems.length) { console.error('Invalid input:\n- ' + problems.join('\n- ')); process.exit(2); }

const need = (k) => { const v = process.env[k]; if (!v && !DRY) { console.error(`Missing secret/env ${k} (see scripts/bootstrap.mjs header)`); process.exit(2); } return v ?? `<${k}>`; };
const GH = need('KIT_GH_TOKEN'), VERCEL = need('VERCEL_TOKEN'), TEAM = need('VERCEL_TEAM_ID'), SUPA = need('SUPABASE_ACCESS_TOKEN'), ORG = need('SUPABASE_ORG_ID'), EMAIL = need('KIT_OWNER_EMAIL');
const KIT = process.env.GITHUB_REPOSITORY || 'esheliko/project-kit';
const OWNER = process.env.NEW_PROJECT_OWNER || KIT.split('/')[0];
const REPO = `${OWNER}/${slug}`;
const log = (m) => console.log(`[bootstrap] ${m}`);

async function api(base, token, method, path, body, extra = {}) {
  if (DRY) { log(`DRY ${method} ${base}${path}`); return {}; }
  const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', ...extra }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 300) }; }
  if (!r.ok) throw new Error(`${method} ${base}${path} -> ${r.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}
const gh = (m, p, b) => api('https://api.github.com', GH, m, p, b, { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
const vercel = (m, p, b) => api('https://api.vercel.com', VERCEL, m, `${p}${p.includes('?') ? '&' : '?'}teamId=${TEAM}`, b);
const supa = (m, p, b) => api('https://api.supabase.com', SUPA, m, p, b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', ...opts });

// 1. Repository from the template (no history, no template-only workflow runs).
log(`creating ${REPO} (${visibility}) from ${KIT}`);
try { if (!DRY) { await gh('GET', `/repos/${REPO}`); console.error(`${REPO} already exists: pick another name`); process.exit(2); } } catch (e) { if (!String(e.message).includes('404')) throw e; }
const repo = await gh('POST', `/repos/${KIT}/generate`, { owner: OWNER, name: slug, description: purpose.slice(0, 300), private: visibility === 'private' });
const repoId = repo.id ?? 0;

// 2. Supabase project (database + auth), sign-up off, the owner invited.
log(`creating Supabase project in ${region}`);
const dbPass = randomBytes(24).toString('base64url');
const proj = await supa('POST', '/v1/projects', { name: slug, organization_id: ORG, db_pass: dbPass, region });
const ref = proj.id ?? proj.ref ?? 'dryrun';
for (let i = 0; !DRY && i < 60; i++) { const s = await supa('GET', `/v1/projects/${ref}`); if (s.status === 'ACTIVE_HEALTHY') break; if (i === 59) throw new Error('Supabase project did not become healthy in 10 min'); await sleep(10_000); }
const keys = DRY ? [] : await supa('GET', `/v1/projects/${ref}/api-keys`);
const key = (n) => keys.find((k) => k.name === n)?.api_key ?? `<${n}>`;
const supabase = { url: `https://${ref}.supabase.co`, anon: key('anon'), service: key('service_role') };
await supa('PATCH', `/v1/projects/${ref}/config/auth`, { disable_signup: true });
if (!DRY) await fetch(`${supabase.url}/auth/v1/invite`, { method: 'POST', headers: { apikey: supabase.service, Authorization: `Bearer ${supabase.service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL }) }).then((r) => { if (!r.ok) log(`owner invite failed (${r.status}): invite them from the Supabase dashboard`); });

// 3. Vercel project, linked to the repo, env vars set, functions next to the database.
log('creating Vercel project');
const vp = await vercel('POST', '/v11/projects', { name: slug, framework: 'nextjs', gitRepository: { type: 'github', repo: REPO }, serverlessFunctionRegion: VERCEL_REGION[region] });
const vercelId = vp.id ?? '<project id>';
for (const e of vercelEnv(supabase)) await vercel('POST', `/v10/projects/${vercelId}/env`, e);

// 4. Repository secrets (values come from here, never from a file).
log('setting repository secrets');
const secretValues = { VERCEL_TOKEN: VERCEL, SUPABASE_ACCESS_TOKEN: SUPA, NEXT_PUBLIC_SUPABASE_URL: supabase.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.anon, SUPABASE_SERVICE_ROLE_KEY: supabase.service };
for (const n of secretNames) { if (DRY) log(`DRY secret ${n}`); else run('gh', ['secret', 'set', n, '--repo', REPO, '--body', secretValues[n]], { env: { ...process.env, GH_TOKEN: GH } }); }

// 5. Labels and the first issues (#1 deploy board and #2 CI status must come first).
for (const l of LABELS) await gh('POST', `/repos/${REPO}/labels`, l);
const issues = [];
for (const i of startIssues({ name, purpose })) issues.push((await gh('POST', `/repos/${REPO}/issues`, i)).number ?? '?');
if (!DRY && (issues[0] !== 1 || issues[1] !== 2)) throw new Error(`issue numbers are ${issues}: the deploy board needs #1 and #2`);

// 6. Fill the placeholders, drop kit-only files, verify, push the first commit to main.
const vars = { NAME: name, SLUG: slug, REPO, PURPOSE: purpose.trim(), REPO_ID: repoId, VERCEL_PROJECT_ID: vercelId, VERCEL_TEAM_ID: TEAM, TODAY: new Date().toISOString().slice(0, 10) };
if (DRY) { log(`DRY would clone ${REPO}, fill ${Object.keys(vars).join(', ')}, remove ${TEMPLATE_ONLY.join(', ')}, verify, push`); }
else {
  const dir = mkdtempSync(join(tmpdir(), 'newproj-'));
  run('git', ['clone', '-q', `https://x-access-token:${GH}@github.com/${REPO}.git`, dir]);
  for (const p of TEMPLATE_ONLY) rmSync(join(dir, p), { recursive: true, force: true });
  const left = new Set();
  (function walk(d) {
    for (const f of readdirSync(d)) {
      if (f === '.git' || f === 'node_modules') continue;
      const p = join(d, f);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      let t; try { t = readFileSync(p, 'utf8'); } catch { continue; }
      if (t.includes('\u0000')) continue;
      const out = substitute(t, vars);
      leftover(out).forEach((k) => left.add(k));
      if (out !== t) writeFileSync(p, out);
    }
  })(dir);
  if (left.size) throw new Error(`unfilled placeholders: ${[...left].join(', ')}`);
  if (!flag('no-verify')) {
    log('verifying the new project (install, lint, typecheck, unit tests)');
    const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: supabase.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.anon };
    for (const c of [['npm', ['ci', '--no-audit', '--no-fund']], ['npm', ['run', 'lint']], ['npm', ['run', 'typecheck']], ['npm', ['test']]]) run(c[0], c[1], { cwd: dir, env, stdio: 'inherit' });
  }
  const git = (...a) => run('git', ['-c', 'user.name=project-kit', '-c', 'user.email=project-kit@users.noreply.github.com', ...a], { cwd: dir });
  git('checkout', '-q', '-B', 'main'); git('add', '-A'); git('commit', '-q', '-m', `Initial project from project-kit\n\nPurpose: ${purpose.trim()}`); git('push', '-q', '-u', 'origin', 'main');
}

// 7. Branch protection: `verify` must pass. Not available on every plan (private repo on a free account): reported, not fatal.
try { await gh('PUT', `/repos/${REPO}/branches/main/protection`, { required_status_checks: { strict: false, contexts: ['verify'] }, enforce_admins: false, required_pull_request_reviews: null, restrictions: null }); }
catch (e) { log(`branch protection not applied (${String(e.message).slice(0, 120)}): the rules in CLAUDE.md still apply`); }

log(`DONE ${DRY ? '(dry run) ' : ''}repo https://github.com/${REPO} | vercel project ${vercelId} | supabase ${ref} | first task: issue #${issues[2] ?? 3}`);
