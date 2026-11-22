// Pure parts of scripts/migrate.mjs (unit tested in tests/unit/migrate.test.ts). No I/O here.

/** Leading number of a migration file name ("0010_film_resume.sql" -> 10), or null when it is not a migration. */
export function migrationNumber(name) {
  const m = /^(\d+)_.+\.sql$/.exec(name);
  return m ? Number(m[1]) : null;
}

/** Migration files only, in filename order. */
export function orderMigrations(files) {
  return files.filter((f) => migrationNumber(f) !== null).sort();
}

/** Files not yet recorded, in order. */
export function pendingMigrations(files, applied) {
  const done = new Set(applied);
  return orderMigrations(files).filter((f) => !done.has(f));
}

/**
 * First run only (nothing recorded yet): which existing files to record WITHOUT running them.
 * `probes` = { hasSchema: library_items exists, through: highest migration number whose schema change is visible in the database (0 = none) }.
 * `flag` = number from --baseline-through (wins over probing).
 * Returns { names, reason } or { error }.
 */
export function decideBaseline({ files, applied, probes, flag = null }) {
  const all = orderMigrations(files);
  if (applied.length > 0) return { names: [], reason: 'already tracking migrations' };
  const upTo = (n) => all.filter((f) => migrationNumber(f) <= n);
  if (flag !== null) return { names: upTo(flag), reason: `--baseline-through ${flag}` };
  if (!probes.hasSchema) return { names: [], reason: 'empty database: every migration will run' };
  if (probes.through < 9) return { error: 'the database has tables but not the schema of migration 0009: cannot tell which migrations were applied. Re-run with --baseline-through NNNN.' };
  return { names: upTo(probes.through), reason: `existing database, schema matches migration ${String(probes.through).padStart(4, '0')}` };
}

/** Project ref = first label of the Supabase URL host. */
export function projectRef(url) {
  try { const h = new URL(url).hostname; return h.endsWith('.supabase.co') ? h.split('.')[0] : null; } catch { return null; }
}

/** Short readable error from a Management API failure body; never includes the request. */
export function apiError(status, body) {
  const msg = typeof body === 'string' ? body : body?.message ?? body?.error ?? JSON.stringify(body);
  return `HTTP ${status}: ${String(msg).slice(0, 600)}`;
}
