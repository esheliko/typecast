#!/usr/bin/env node
// Applies supabase/migrations/*.sql that are not yet recorded, in filename order, through the Supabase Management API.
//   node scripts/migrate.mjs [--status] [--dry-run] [--baseline-through 0009]
// Records each applied file in public.schema_migrations. Each migration and its record insert go in ONE request (one transaction);
// stops at the first failure and prints the SQL error. Exit: 0 ok, 1 a migration failed, 2 cannot run (no token / URL).
// Token: SUPABASE_ACCESS_TOKEN (CI, Deploy Manager); in Claude sessions the proxy injects it, so a dummy is sent. Never logged.
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decideBaseline, pendingMigrations, projectRef, apiError, migrationNumber } from './migrate-lib.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const DIR = new URL('../supabase/migrations/', import.meta.url);
const log = (...a) => console.log('[migrate]', ...a);

const ref = projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
const token = process.env.SUPABASE_ACCESS_TOKEN || (process.env.HTTPS_PROXY ? 'dummy' : '');
if (!ref) { log('NEXT_PUBLIC_SUPABASE_URL is missing or not a *.supabase.co URL'); process.exit(2); }
if (!token) { log('SUPABASE_ACCESS_TOKEN is not set (and this is not a Claude session with the Supabase proxy)'); process.exit(2); }

// curl, not fetch: Node's fetch ignores the agent proxy used in Claude sessions. Body and token go through 0600 temp files (never argv or logs).
const tmp = mkdtempSync(join(tmpdir(), 'migrate-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
writeFileSync(join(tmp, 'auth.cfg'), `header = "Authorization: Bearer ${token}"\nheader = "Content-Type: application/json"\n`, { mode: 0o600 });
async function sql(query) {
  writeFileSync(join(tmp, 'body.json'), JSON.stringify({ query }), { mode: 0o600 });
  const r = spawnSync('curl', ['-sS', '-X', 'POST', '-K', join(tmp, 'auth.cfg'), '--data-binary', `@${join(tmp, 'body.json')}`, '-w', '\n%{http_code}',
    `https://api.supabase.com/v1/projects/${ref}/database/query`], { encoding: 'utf8', maxBuffer: 64e6 });
  if (r.status !== 0) throw new Error(`curl failed: ${String(r.stderr).slice(0, 200)}`);
  const i = r.stdout.lastIndexOf('\n');
  const status = Number(r.stdout.slice(i + 1));
  const text = r.stdout.slice(0, i);
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (status < 200 || status >= 300) throw new Error(apiError(status, body));
  return body;
}
const q = (s) => `'${s.replace(/'/g, "''")}'`;

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql'));
const flagArg = arg('--baseline-through');
const flag = flagArg === null ? null : Number(flagArg);
if (flagArg !== null && !Number.isInteger(flag)) { log('--baseline-through needs a number like 0009'); process.exit(2); }

try {
  const exists = (await sql(`select to_regclass('public.schema_migrations') is not null as t`))[0]?.t === true;
  const applied = exists ? (await sql('select name from public.schema_migrations')).map((r) => r.name) : [];
  let baseline = [];
  if (applied.length === 0) {
    const p = (await sql(`select
      to_regclass('public.library_items') is not null as has_schema,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='calendar_token') as m9,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='library_items' and column_name='stopped_min') as m10`))[0];
    const through = p.m10 ? 10 : p.m9 ? 9 : 0;
    const d = decideBaseline({ files, applied, probes: { hasSchema: p.has_schema, through }, flag });
    if (d.error) { log(d.error); process.exit(1); }
    baseline = d.names;
    log(`baseline: ${baseline.length ? `${baseline.length} file(s) recorded without running (${baseline[0]} .. ${baseline.at(-1)})` : 'none'}; ${d.reason}`);
  }
  const recorded = [...applied, ...baseline];
  const pending = pendingMigrations(files, recorded);
  if (has('--status') || has('--dry-run')) {
    log(`recorded: ${recorded.length}${exists ? '' : ' (table not created yet; --status/--dry-run change nothing)'}`);
    log(pending.length ? `pending (${pending.length}): ${pending.join(', ')}` : 'pending: none');
    process.exit(0);
  }
  await sql(`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now());
alter table public.schema_migrations enable row level security;`);
  if (baseline.length) await sql(`insert into public.schema_migrations (name) values ${baseline.map((n) => `(${q(n)})`).join(',')} on conflict do nothing;`);
  for (const f of pending) {
    log(`applying ${f} ...`);
    try {
      await sql(`${readFileSync(new URL(f, DIR), 'utf8')}\n;\ninsert into public.schema_migrations (name) values (${q(f)}) on conflict do nothing;`);
    } catch (e) {
      log(`FAILED ${f} (migration ${migrationNumber(f)}): ${e.message}`);
      log('nothing after it was run; fix the file or the database, then run again');
      process.exit(1);
    }
    log(`applied ${f}`);
  }
  log(pending.length ? `done: ${pending.length} migration(s) applied` : 'nothing to apply');
} catch (e) {
  log(`failed: ${e.message}`);
  process.exit(1);
}
