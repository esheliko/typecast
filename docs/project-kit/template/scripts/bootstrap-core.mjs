// Pure helpers for scripts/bootstrap.mjs (the new-project automation). Unit tested in tests/unit/bootstrap.test.ts.

/** Files and folders that exist only in the kit; a generated project must not keep them. */
export const TEMPLATE_ONLY = [
  'scripts/bootstrap.mjs', 'scripts/bootstrap-core.mjs', 'tests/unit/bootstrap.test.ts',
  '.github/workflows/new-project.yml', '.claude/skills/new-project',
];

/** Supabase region -> nearest Vercel function region (functions must stay next to the database). */
export const VERCEL_REGION = {
  'ap-south-1': 'bom1', 'ap-southeast-1': 'sin1', 'ap-northeast-1': 'hnd1', 'ap-southeast-2': 'syd1',
  'eu-west-1': 'dub1', 'eu-west-2': 'lhr1', 'eu-central-1': 'fra1', 'us-east-1': 'iad1', 'us-west-1': 'sfo1', 'sa-east-1': 'gru1',
};

export const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');

/** Problems with the inputs (empty = fine). The display name is pasted into source files, so it is kept to safe characters. */
export function validateInputs({ name, slug, purpose, visibility, region } = {}) {
  const p = [];
  if (!name || !/^[A-Za-z0-9][A-Za-z0-9 &'.-]{0,38}[A-Za-z0-9.]$/.test(name) || name.includes("'")) p.push('name: 2-40 letters, digits, spaces, "-", "&" or "." (no quotes)');
  if (!slug || !/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) p.push('slug: lowercase letters, digits and "-", 3-40 characters, starting with a letter');
  if (!purpose || String(purpose).trim().length < 10) p.push('purpose: at least a sentence');
  if (visibility && !['private', 'public'].includes(visibility)) p.push('visibility: private or public');
  if (region && !VERCEL_REGION[region]) p.push(`region: one of ${Object.keys(VERCEL_REGION).join(', ')}`);
  return p;
}

/** Replaces every {{KEY}} that has a value; unknown placeholders are left in place and reported by `leftover`. */
export const substitute = (text, vars) => text.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
export const leftover = (text) => [...new Set([...text.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]))];

/** Environment variables of the Vercel project. NEXT_PUBLIC_* are plain (they ship to the browser anyway), the rest are encrypted. */
export function vercelEnv({ url, anon, service }) {
  const target = ['production', 'preview', 'development'];
  return [
    { key: 'NEXT_PUBLIC_SUPABASE_URL', value: url, type: 'plain', target },
    { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: anon, type: 'plain', target },
    { key: 'SUPABASE_SERVICE_ROLE_KEY', value: service, type: 'encrypted', target: ['production', 'preview'] },
  ];
}

/** GitHub Actions secrets of the new repo. Names only here; values come from the environment / created resources. */
export const secretNames = ['VERCEL_TOKEN', 'SUPABASE_ACCESS_TOKEN', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

/** The three issues every project starts with, in this order: #1 and #2 are fixed by the deploy board and the CI status script. */
export function startIssues({ name, purpose }) {
  return [
    { title: 'Deploy board', body: 'Maintained by `scripts/deploy-manager.mjs` (GitHub Actions). Do not edit by hand; see DEPLOYING.md.' },
    { title: 'CI status of main', body: 'Maintained by `scripts/ci-status.mjs`. Do not edit by hand.' },
    { title: `First version of ${name}`, body: `## Purpose\n${purpose.trim()}\n\n## What to do\nRead CLAUDE.md and README.md, then propose a short plan (pages, data model, what you will build first) in a \`🔴 NEEDS YOU:\` reply if anything is ambiguous, otherwise build the first version through the normal branch + PR flow.\n\nThe repository, Vercel project, Supabase project and CI secrets already exist: do not create them.` },
  ];
}
export const LABELS = [
  { name: 'process-request', color: 'fbca04', description: 'A rule/hook/CI/deploy change for the next process session' },
  { name: 'automation-data', color: 'ededed', description: 'Machine-written automation board data' },
];
