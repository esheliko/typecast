#!/usr/bin/env node
// Production runtime logs, newest first. Usage:
//   node scripts/logs.mjs                    errors of the live deployment
//   node scripts/logs.mjs --digest 2918209373   the error behind "Reference 2918209373" on the error screen
//   node scripts/logs.mjs --all              every level, not just errors
//   node scripts/logs.mjs --path /library    only requests for that path
//   node scripts/logs.mjs --deployment dpl_x a specific deployment (default: latest production)
// Auth: VERCEL_TOKEN if set; in Claude sessions the proxy authenticates api.vercel.com, no token needed.
import { execFileSync } from 'node:child_process';

const CFG = { projectId: 'prj_htusg5FPMRrzdb13rRG8flOxXBdU', teamId: 'team_qGoklBrMP6rta9mkHDjVJUMq' };
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const all = args.includes('--all');

function curl(url, accept = 'application/json', max = 30) {
  const h = ['-H', `Accept: ${accept}`];
  if (process.env.VERCEL_TOKEN) h.push('-H', `Authorization: Bearer ${process.env.VERCEL_TOKEN}`);
  try { return execFileSync('curl', ['-sS', '--max-time', String(max), ...h, url], { encoding: 'utf8', maxBuffer: 64e6 }); }
  catch (e) { return e.stdout ? String(e.stdout) : ''; } // curl exits 28 when the stream is still open at the timeout; the body we got is what we want
}

let id = opt('--deployment');
if (!id) {
  const r = JSON.parse(curl(`https://api.vercel.com/v6/deployments?projectId=${CFG.projectId}&teamId=${CFG.teamId}&target=production&state=READY&limit=1`));
  id = r.deployments?.[0]?.uid;
  if (!id) { console.error('No live production deployment found (or not authorised: set VERCEL_TOKEN).'); process.exit(1); }
  console.error(`deployment ${id} (${r.deployments[0].meta?.githubCommitSha?.slice(0, 7) ?? '?'})`);
}
const raw = curl(`https://api.vercel.com/v1/projects/${CFG.projectId}/deployments/${id}/runtime-logs?teamId=${CFG.teamId}`, 'application/stream+json', 25);
const digest = opt('--digest'), path = opt('--path');
const rows = raw.split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } })
  .filter((r) => (all || r.level === 'error' || (r.responseStatusCode ?? 0) >= 500))
  .filter((r) => !digest || String(r.message).includes(digest))
  .filter((r) => !path || r.requestPath === path)
  .sort((a, b) => b.timestampInMs - a.timestampInMs);
if (!rows.length) { console.log('No matching log lines. (Runtime logs only keep a short window; try --all, or check the deployment id.)'); process.exit(0); }
for (const r of rows.slice(0, 40)) {
  console.log(`${new Date(r.timestampInMs).toISOString()} ${r.level ?? ''} ${r.requestMethod ?? ''} ${r.requestPath ?? ''} ${r.responseStatusCode ?? ''}\n${r.message}\n`);
}
