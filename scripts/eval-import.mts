/**
 * Measure the import matcher on a real list against live TMDB. Not part of CI (it needs the network and a TMDB token).
 *
 *   TMDB_TOKEN=... npx tsx scripts/eval-import.mts tests/import-eval/list-2.txt [--expect tests/import-eval/list-2.expect.json] [--out report.txt]
 *
 * Prints how many lines were sure / unsure / unmatched and each unsure or unmatched line with its guess. With --expect (a JSON map of
 * line -> "movie:ID" or "tv:ID") it also checks those lines resolved to exactly that title (sure, or as the unsure guess) and exits 1 if not.
 * In a sandbox behind a proxy run with NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=<proxy ca bundle>.
 * To see a typo list that needs Wikipedia's "did you mean" while offline, stub fetch for en.wikipedia.org before importing this.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseText } from "../src/lib/list-parse";
import { resolveEntries, type Unsure } from "../src/lib/letterboxd";

async function main() {
  const args = process.argv.slice(2);
  const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
  if (!file) { console.error("usage: eval-import.mts <list.txt> [--expect expect.json] [--out report.txt]"); process.exit(2); }
  const entries = parseText(readFileSync(file, "utf8"), "watchlist");
  const rows: Awaited<ReturnType<typeof resolveEntries>>["rows"] = [], unmatched: Awaited<ReturnType<typeof resolveEntries>>["unmatched"] = [], unsure: Unsure[] = [];
  for (let i = 0; i < entries.length; i += 25) { const r = await resolveEntries(entries.slice(i, i + 25)); rows.push(...r.rows); unmatched.push(...r.unmatched); unsure.push(...r.unsure); }
  const f = (x: { title: string; year: string; type: string }) => `${x.title} (${x.year}) ${x.type}`;
  const out = [`lines ${entries.length}: sure ${rows.length}, unsure ${unsure.length} (${unsure.filter((u) => !u.risky).length} addable in bulk), unmatched ${unmatched.length}`, "", "SURE"];
  for (const r of rows) out.push(`  ${r.label}  ->  ${f(r)}`);
  out.push("", "UNSURE");
  for (const u of unsure) out.push(`  ${u.label}  ->  ${f(u.guess)}  [${u.why}${u.risky ? " RISKY" : ""}${u.weak ? " WEAK" : ""}]  alts: ${u.alts.slice(0, 3).map(f).join(" | ")}`);
  out.push("", "UNMATCHED");
  for (const u of unmatched) out.push(`  ${u.label}${u.error ? `  (${u.error})` : ""}`);
  const outFile = flag("--out");
  if (outFile) writeFileSync(outFile, out.join("\n")); else console.log(out.join("\n"));
  console.log(out[0]);

  const expectFile = flag("--expect");
  if (!expectFile) return;
  const expect = JSON.parse(readFileSync(expectFile, "utf8")) as Record<string, string>;
  const got = new Map<string, string>();
  for (const r of rows) got.set(r.label, `${r.type}:${r.id}`);
  for (const u of unsure) got.set(u.label, u.guess.key);
  let bad = 0;
  for (const [label, want] of Object.entries(expect)) if (got.get(label) !== want) { bad++; console.log(`FAIL ${label}: wanted ${want}, got ${got.get(label) ?? "nothing"}`); }
  console.log(bad ? `${bad} of ${Object.keys(expect).length} expectations failed` : `all ${Object.keys(expect).length} expectations met`);
  if (bad) process.exit(1);
}
main();
