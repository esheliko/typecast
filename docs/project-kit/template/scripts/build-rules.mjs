#!/usr/bin/env node
// Single source of truth for the process rules: process/rules.json.
//
//   npm run rules:build        regenerate the generated parts from process/rules.json
//   npm run rules:check        (also part of `npm run lint`) fail when a generated part is out of sync, the file is malformed,
//                              or the always-loaded text is over budget
//
// Generated: the standing-rule blocks in CLAUDE.md (between the rules:begin / rules:end markers), .claude/hooks/rules-session.txt and
// .claude/hooks/rules-prompt.txt (the two hooks `cat` these). Everything else in CLAUDE.md and the hooks stays hand-written.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const FILES = {
  rules: 'process/rules.json',
  claude: 'CLAUDE.md',
  session: '.claude/hooks/rules-session.txt',
  prompt: '.claude/hooks/rules-prompt.txt',
  hookSession: '.claude/hooks/session-start.sh',
  hookPrompt: '.claude/hooks/prompt-submit.sh',
};
export const BEGIN = '<!-- rules:begin (GENERATED from process/rules.json: edit there, then `npm run rules:build`) -->';
export const END = '<!-- rules:end -->';

// Pure: problems with the parsed rules file (empty = fine).
export function validate(doc) {
  const p = [];
  if (!doc || typeof doc !== 'object') return ['rules file is not an object'];
  if (!Number.isInteger(doc.budget?.alwaysLoadedTokens) || doc.budget.alwaysLoadedTokens <= 0) p.push('budget.alwaysLoadedTokens must be a positive integer');
  if (!Array.isArray(doc.rules) || !doc.rules.length) return [...p, 'rules must be a non-empty array'];
  const ids = new Set();
  for (const r of doc.rules) {
    const who = `rule ${r?.id ?? '(no id)'}`;
    if (!r || typeof r.id !== 'string' || !/^[a-z0-9-]+$/.test(r.id)) { p.push(`${who}: id must be lowercase-kebab`); continue; }
    if (ids.has(r.id)) p.push(`${who}: duplicate id`);
    ids.add(r.id);
    for (const k of ['title', 'why', 'added', 'decidedBy', 'reviewed']) if (typeof r[k] !== 'string' || !r[k]) p.push(`${who}: ${k} is required`);
    for (const k of ['added', 'reviewed']) if (typeof r[k] === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(r[k])) p.push(`${who}: ${k} must be YYYY-MM-DD`);
    if (!Array.isArray(r.enforcedBy)) p.push(`${who}: enforcedBy must be an array (use [] for "none")`);
    if (!Array.isArray(r.claudeMd) || r.claudeMd.some((l) => typeof l !== 'string')) p.push(`${who}: claudeMd must be an array of lines`);
    for (const k of ['sessionHook', 'promptHook']) if (typeof r[k] !== 'string') p.push(`${who}: ${k} must be a string ("" for none)`);
    if (r.sessionHook?.includes('\n') || r.promptHook?.includes('\n')) p.push(`${who}: hook text must be one line`);
  }
  return p;
}

// Pure: the CLAUDE.md block (rules in file order, one blank line between rules that have text).
export function renderClaudeMd(doc) {
  return doc.rules.filter((r) => r.claudeMd.length).map((r) => r.claudeMd.join('\n')).join('\n\n');
}
export const renderSession = (doc) => doc.rules.map((r) => r.sessionHook).filter(Boolean).join('\n') + '\n';
export const renderPrompt = (doc) => 'REMINDERS (CLAUDE.md): ' + doc.rules.map((r) => r.promptHook).filter(Boolean).join('; ') + '.\n';

// Pure: replace the text between the markers. Throws when a marker is missing.
export function replaceRegion(text, body) {
  const a = text.indexOf(BEGIN), b = text.indexOf(END);
  if (a < 0 || b < 0 || b < a) throw new Error(`CLAUDE.md must contain the markers\n${BEGIN}\n${END}`);
  return text.slice(0, a + BEGIN.length) + '\n' + body + '\n' + text.slice(b);
}

// Pure: rough token count of the always-loaded text (bytes / 4, deliberately a bit high for emoji).
export const approxTokens = (...texts) => Math.ceil(texts.reduce((n, t) => n + Buffer.byteLength(t, 'utf8'), 0) / 4);

// Pure: what the generated files should contain, and the problems with the current ones. `cur` = current file texts.
export function plan(doc, cur) {
  const want = {
    claude: replaceRegion(cur.claude, renderClaudeMd(doc)),
    session: renderSession(doc),
    prompt: renderPrompt(doc),
  };
  const problems = [];
  for (const k of ['claude', 'session', 'prompt']) if (cur[k] !== want[k]) problems.push(`${FILES[k]} is out of sync with ${FILES.rules}`);
  const tokens = approxTokens(want.claude, want.session, want.prompt);
  if (tokens > doc.budget.alwaysLoadedTokens) problems.push(`always-loaded rule text is ~${tokens} tokens, over the budget of ${doc.budget.alwaysLoadedTokens} (process/rules.json budget): remove or shorten something, or move detail into docs/`);
  return { want, problems, tokens };
}

const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');

function main() {
  const check = process.argv.includes('--check');
  let doc;
  try { doc = JSON.parse(read(FILES.rules)); } catch (e) { console.error(`${FILES.rules} is not valid JSON: ${e.message}`); process.exit(1); }
  const bad = validate(doc);
  if (bad.length) { console.error(bad.map((m) => `rules: ${m}`).join('\n')); process.exit(1); }
  const cur = { claude: read(FILES.claude), session: read(FILES.session), prompt: read(FILES.prompt) };
  let res;
  try { res = plan(doc, cur); } catch (e) { console.error(e.message); process.exit(1); }
  if (check) {
    if (res.problems.length) { console.error(res.problems.join('\n') + '\nFix: edit process/rules.json, then run `npm run rules:build` and commit the result.'); process.exit(1); }
    console.log(`rules ok: ${doc.rules.length} rules, always-loaded ~${res.tokens}/${doc.budget.alwaysLoadedTokens} tokens`);
    return;
  }
  for (const k of ['claude', 'session', 'prompt']) if (cur[k] !== res.want[k]) { writeFileSync(FILES[k], res.want[k]); console.log(`wrote ${FILES[k]}`); }
  const over = res.problems.filter((m) => m.includes('budget'));
  console.log(`rules: ${doc.rules.length} rules, always-loaded ~${res.tokens}/${doc.budget.alwaysLoadedTokens} tokens`);
  if (over.length) { console.error(over.join('\n')); process.exit(1); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
