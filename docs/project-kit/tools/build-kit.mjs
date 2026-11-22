#!/usr/bin/env node
// Refreshes the SHARED process files of the kit (docs/project-kit/template/) from this repo's live copies, replacing
// project-specific values with {{PLACEHOLDERS}}. Hand-written kit files (app shell, CLAUDE.md, DEPLOYING.md, new-project
// workflow, bootstrap script) are never touched.
//   node docs/project-kit/tools/build-kit.mjs           copy live -> template
//   node docs/project-kit/tools/build-kit.mjs --check   exit 1 and list files whose live copy differs from the template
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUT = 'docs/project-kit/template';
// File or directory (copied recursively). Add a line here when a new shared mechanism appears.
export const SHARED = [
  'scripts/build-rules.mjs', 'scripts/check-client-boundary.mjs', 'scripts/ci-status.mjs', 'scripts/ci-watch.mjs',
  'scripts/deploy-manager.mjs', 'scripts/automation.mjs', 'scripts/automation-core.mjs', 'scripts/process-changelog.mjs',
  'scripts/resume-limited.mjs', 'scripts/stale-red-prs.mjs', 'scripts/migrate.mjs', 'scripts/migrate-lib.mjs',
  'scripts/logs.mjs', 'scripts/shot.mjs', 'scripts/smoke.mjs',
  '.github/workflows/ci.yml', '.github/workflows/deploy-manager.yml', '.github/workflows/automation.yml',
  '.github/ISSUE_TEMPLATE', '.github/pull_request_template.md',
  '.claude/hooks', '.claude/settings.json', '.claude/skills/process',
  'process/rules.json',
  'tests/unit/rules.test.ts', 'tests/unit/process-changelog.test.ts', 'tests/unit/automation.test.ts', 'tests/unit/migrate.test.ts',
  'tests/unit/resume-limited.test.ts', 'tests/unit/smoke-account.test.ts', 'tests/unit/deploy-board-format.test.ts',
  'tests/unit/deploy-gate.test.ts', 'tests/unit/deploy-markers.test.ts', 'tests/unit/deploy-pipeline.test.ts', 'tests/unit/deploy-state-safety.test.ts',
  'tests/smoke/account.ts', 'tests/smoke/account-rules.ts', 'tests/smoke/auth.ts', 'tests/smoke/global-teardown.ts',
];
// Order matters: longest/most specific first.
export const SUBS = [
  ['prj_htusg5FPMRrzdb13rRG8flOxXBdU', '{{VERCEL_PROJECT_ID}}'],
  ['team_qGoklBrMP6rta9mkHDjVJUMq', '{{VERCEL_TEAM_ID}}'],
  ['repoId: 1449507354', "repoId: Number('{{REPO_ID}}')"],
  ['esheliko/typecast', '{{REPO}}'],
  ["name: 'typecast'", "name: '{{SLUG}}'"],
  ['esheliko@gmail.com', 'person@gmail.com'],
  ["      TMDB_TOKEN: ${{ secrets.TMDB_TOKEN || 'dummy' }}\n", ''],
  [' NEXT_PUBLIC_SUPABASE_ANON_KEY TMDB_TOKEN; do', ' NEXT_PUBLIC_SUPABASE_ANON_KEY; do'],
  ['Typecast', '{{NAME}}'],
];
export const apply = (text) => SUBS.reduce((t, [a, b]) => t.split(a).join(b), text);

function* files(p) {
  if (!existsSync(p)) return;
  if (statSync(p).isDirectory()) { for (const f of readdirSync(p)) yield* files(join(p, f)); } else yield p;
}

if (process.argv[1].endsWith('build-kit.mjs')) {
  const check = process.argv.includes('--check');
  const drift = [];
  for (const entry of SHARED) {
    for (const f of files(entry)) {
      const want = apply(readFileSync(f, 'utf8'));
      const dest = join(OUT, f);
      const have = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
      if (have === want) continue;
      drift.push(f);
      if (!check) { mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, want); }
    }
  }
  if (check) {
    if (drift.length) { console.error(`kit is behind the live process files (${drift.length}):\n  ${drift.join('\n  ')}\nRun: node docs/project-kit/tools/build-kit.mjs`); process.exit(1); }
    console.log('kit is in sync with the live process files');
  } else console.log(drift.length ? `updated ${drift.length} file(s):\n  ${drift.join('\n  ')}` : 'nothing to update');
}
