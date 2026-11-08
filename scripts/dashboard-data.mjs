#!/usr/bin/env node
// Writes the JSON files behind the "Typecast Deploy Board" artifact: node scripts/dashboard-data.mjs <outdir>
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const out = process.argv[2] ?? '.';
mkdirSync(out, { recursive: true });
const P = 'prj_htusg5FPMRrzdb13rRG8flOxXBdU', T = 'team_qGoklBrMP6rta9mkHDjVJUMq';
const sh = (c, a) => execFileSync(c, a, { encoding: 'utf8', maxBuffer: 64e6 });
const now = Date.now();
const seen = new Set(); const deps = []; let until;
for (let i = 0; i < 6; i++) {
  const j = JSON.parse(sh('curl', ['-sS', `https://api.vercel.com/v6/deployments?projectId=${P}&teamId=${T}&limit=100&since=${now - 48 * 3600e3}${until ? `&until=${until}` : ''}`]));
  for (const d of j.deployments) if (!seen.has(d.uid)) { seen.add(d.uid); deps.push(d); }
  until = j.pagination?.next; if (!until) break;
}
const hours = []; // last 48h, hourly buckets
const top = Math.floor(now / 3600e3) * 3600e3;
for (let h = 47; h >= 0; h--) hours.push({ hour: new Date(top - h * 3600e3).toISOString().slice(0, 13) + ':00Z', deploys: 0 });
for (const d of deps) { const k = new Date(Math.floor(d.created / 3600e3) * 3600e3).toISOString().slice(0, 13) + ':00Z'; const b = hours.find((x) => x.hour === k); if (b) b.deploys++; }
const used24 = deps.filter((d) => d.created > now - 24 * 3600e3).length;
const issue = JSON.parse(sh('gh', ['api', 'repos/esheliko/typecast/issues/1']));
const body = issue.body ?? '';
const st = JSON.parse((body.match(/<!--state ([\s\S]*?) state-->/) ?? [, '{}'])[1]);
const line = (body.match(/\*\*(.+?)\*\* — (.*)/) ?? []);
const cell = (k) => (body.match(new RegExp(`\\| ${k} \\| (.*) \\|`)) ?? [])[1] ?? '';
const ready = deps.find((d) => d.readyState === 'READY' && d.target === 'production');
const pend = []; for (const m of body.matchAll(/^- `([0-9a-f]{7})` (.*) · (\S+) ago$/gm)) { let committed = ''; try { committed = sh('git', ['log', '-1', '--format=%cI', m[1]]).trim(); } catch {} pend.push({ sha: m[1], subject: m[2], age: m[3], committed }); }
const writeJ = (n, v) => writeFileSync(`${out}/${n}.json`, JSON.stringify(v));
writeJ('status', [{ state: line[1] ?? 'UNKNOWN', why: line[2] ?? '', live_sha: ready?.meta?.githubCommitSha?.slice(0, 7) ?? '', live_age_min: ready ? Math.round((now - ready.created) / 60000) : null, pending_commits: pend.length, deploys_24h: used24, last_tick: st.lastWrite ? new Date(st.lastWrite).toISOString() : '', refreshed: new Date(now).toISOString(), ticks: st.ticks ?? 0 }]);
writeJ('hourly', hours);
writeJ('pending', pend);
writeJ('recent', (st.deploys ?? []).slice(0, 12).map((x) => ({ at: new Date(x.at).toISOString(), sha: x.sha.slice(0, 7), batched: x.n, minutes_to_live: x.latencyMin, result: x.state })));
writeJ('events', (st.events ?? []).slice(0, 10).map((e) => ({ at: new Date(e.t).toISOString(), kind: e.kind, message: e.msg })));
console.log('ok', used24, hours.reduce((s, h) => s + h.deploys, 0));
