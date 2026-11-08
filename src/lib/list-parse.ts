/** Turn whatever the user gives us (Letterboxd CSV/zip, a plain list, a notes-app checklist) into import entries. Pure: runs in the browser. */
import { buildEntries, parseCsv, stars, type LbEntry } from "./letterboxd-parse";

export type Plain = "watched" | "watchlist";

const CHECKED = /^\s*(?:[-*+•]\s*)?(?:\[\s*[xXvV✓✔]\s*\]|\(\s*[xXvV✓✔]\s*\)|[☑☒✅✔✓■])\s*/;
const UNCHECKED = /^\s*(?:[-*+•]\s*)?(?:\[\s*\]|\(\s*\)|[☐□▢⬜])\s*/;
const BULLET = /^\s*(?:[-*+•–—]\s+|\d+[.)]\s+)/;
const TODO_HEAD = /^(to ?watch|watch ?list|want to watch|wish ?list|to ?do|queue|up next|unwatched|plan to watch|watch later)(\s+list)?$/i;
const DONE_HEAD = /^(watched|seen|already watched|done|finished|watch history|history|completed)$/i;
const SKIP = /^(movies?|films?|tv|shows?|series|tv shows?)$/i;

/** One line of free text to an entry. `null` for blanks, headings and anything that is not a title. */
function parseLine(raw: string, mode: Plain): { entry: LbEntry } | { mode: Plain } | null {
  let s = raw.trim();
  if (!s || s.length > 200) return null;
  let watched: boolean | null = null;
  if (CHECKED.test(s)) { watched = true; s = s.replace(CHECKED, ""); }
  else if (UNCHECKED.test(s)) { watched = false; s = s.replace(UNCHECKED, ""); }
  else {
    const head = s.replace(/^#+\s*/, "").replace(/[:\-–—]+$/, "").replace(/\*\*/g, "").trim();
    const topic = "(?:movies?|films?|shows?|tv(?: shows?)?|series)", words = new RegExp(`^(?:my\\s+)?(?:${topic}\\s+)?|(?:\\s+${topic})$`, "gi");
    const bare = head.replace(words, "").trim();
    if (bare !== head && TODO_HEAD.test(bare)) return { mode: "watchlist" };
    if (bare !== head && DONE_HEAD.test(bare)) return { mode: "watched" };
    if (TODO_HEAD.test(head)) return { mode: "watchlist" };
    if (DONE_HEAD.test(head)) return { mode: "watched" };
    if (/^#+\s/.test(s) || SKIP.test(head)) return null;
    s = s.replace(BULLET, "");
  }
  const struck = s.match(/^~~(.+)~~$/);
  if (struck) { s = struck[1]; watched = true; }
  s = s.replace(/\*\*|__/g, "").trim();
  const wip = /(?:^|\s)(?:WIP|watching)\s*$/i.test(s);
  if (wip) s = s.replace(/[\s\-–—:|,(]*(?:WIP|watching)\)?\s*$/i, "").trim();
  let rating = 0;
  const grab = (re: RegExp, f: (m: RegExpMatchArray) => number) => { const m = s.match(re); if (m) { rating = f(m); s = s.slice(0, m.index).trim(); } };
  grab(/\s*[-–—:|,]?\s*([★⭐]+)\s*$/, (m) => Math.min(5, [...m[1]].length));
  if (!rating) grab(/\s*[-–—:|,]?\s*\(?(\d(?:\.\d)?)\s*\/\s*(5|10)\)?\s*$/, (m) => stars(String(m[2] === "10" ? parseFloat(m[1]) / 2 : m[1])));
  if (!rating) grab(/\s*[-–—:|,]?\s*\(?(\d(?:\.\d)?)\s*stars?\)?\s*$/i, (m) => stars(m[1]));
  let year: number | null = null;
  const y = s.match(/\s*[(\[]((?:18|19|20)\d\d)[)\]]\s*$/) ?? s.match(/\s*(?:,|\s[-–—])\s*((?:18|19|20)\d\d)\s*$/);
  if (y) { year = parseInt(y[1], 10); s = s.slice(0, y.index).trim(); }
  if (!y) { const t = s.match(/^(.*\S\s+\S.*?)\s+((?:19|20)\d\d)$/); if (t) { s = t[1]; year = parseInt(t[2], 10); } }
  s = s.replace(/\s*\([^()]*\)\s*$/, "").replace(/^["“'‘]+|["”'’]+$/g, "").trim();
  if (!/[\p{L}\p{N}]/u.test(s) || s.length < 1) return null;
  const isWatched = !wip && (watched ?? mode === "watched");
  return { entry: { name: s, year, watched: isWatched, watchlist: !isWatched && !wip, watching: wip, rating: isWatched ? rating : 0, date: null, tv: true } };
}

/** Free text: one title per line. A checkbox ([x], [ ], ☑, ☐, ✅ ...) or a "Watched"/"To watch" heading decides watched vs to-watch; otherwise `plain` does. */
export function parseText(text: string, plain: Plain): LbEntry[] {
  const out = new Map<string, LbEntry>();
  let mode = plain;
  for (const line of text.split(/\r?\n|\r/)) {
    const r = parseLine(line, mode);
    if (!r) continue;
    if ("mode" in r) { mode = r.mode; continue; }
    const e = r.entry, k = `${e.name.toLowerCase()}|${e.year ?? ""}`, o = out.get(k);
    if (!o) out.set(k, e);
    else if (e.watching) { if (!o.watched) { o.watching = true; o.watchlist = false; } }
    else if (e.watched) { o.watched = true; o.watchlist = false; o.watching = false; o.rating = e.rating || o.rating; }
  }
  return [...out.values()];
}

const isLbCsv = (text: string) => {
  const head = (text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "").toLowerCase();
  return head.includes(",") && /(^|,)"?name"?(,|$)/.test(head) && head.includes("year");
};

/** Letterboxd CSVs (named like the export, or recognised by their header) are merged as before; everything else is read as a list. */
export function parseAny(files: { name: string; text: string }[], plain: Plain): LbEntry[] {
  const lb: { name: string; text: string }[] = [], lists: string[] = [];
  const known = /(^|\/)(watched|ratings|diary|watchlist)\.csv$/i;
  for (const f of files) {
    if (known.test(f.name)) lb.push(f);
    else if (isLbCsv(f.text) && parseCsv(f.text).length) lb.push({ name: /watched date/i.test(f.text.split(/\r?\n/, 1)[0]) ? "diary.csv" : /(^|,)rating(,|$)/i.test(f.text.split(/\r?\n/, 1)[0]) ? "ratings.csv" : "watched.csv", text: f.text });
    else lists.push(f.text);
  }
  const merged = buildEntries(lb);
  const seen = new Set(merged.map((e) => e.name.toLowerCase()));
  const extra = lists.flatMap((t) => parseText(t, plain)).filter((e) => !seen.has(e.name.toLowerCase()));
  return [...merged, ...extra];
}
