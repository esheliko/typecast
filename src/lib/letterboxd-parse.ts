/** Pure parsing for Letterboxd data (CSV export, zip, RSS feed). No server or browser imports, so both sides can use it. */
import type { MediaType } from "./types";

/** One film from a Letterboxd export, merged across watched/ratings/diary/watchlist. */
export interface LbEntry { name: string; year: number | null; watched: boolean; watchlist: boolean; rating: number; date: string | null; tv?: boolean }

export function parseCsv(text: string): Record<string, string>[] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); cell = ""; rows.push(row); row = []; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x !== ""));
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ""])));
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v?: string) => (v && DAY.test(v.trim()) ? v.trim() : null);
/** Letterboxd rates in half stars (0.5 to 5); Typecast keeps whole stars, so 3.5 becomes 4. */
export const stars = (v?: string) => { const n = parseFloat(v ?? ""); return Number.isFinite(n) ? Math.max(0, Math.min(5, Math.round(n))) : 0; };

/** Merge the export's CSV files (by file name: watched, ratings, diary, watchlist) into one entry per film. Other files are ignored. */
export function buildEntries(files: { name: string; text: string }[]): LbEntry[] {
  type Acc = { name: string; year: number | null; watched: boolean; watchlist: boolean; rated: number; diaryRating: number; diaryDate: string | null; markedDate: string | null };
  const all = new Map<string, Acc>();
  for (const f of files) {
    const kind = (f.name.split("/").pop() ?? "").toLowerCase().replace(/\.csv$/, "");
    if (!["watched", "ratings", "diary", "watchlist"].includes(kind)) continue;
    for (const r of parseCsv(f.text)) {
      const name = (r["Name"] ?? "").trim();
      if (!name) continue;
      const y = parseInt(r["Year"] ?? "", 10);
      const key = r["Letterboxd URI"]?.trim() || `${name}|${y}`;
      let e = all.get(key);
      if (!e) { e = { name, year: Number.isFinite(y) ? y : null, watched: false, watchlist: false, rated: 0, diaryRating: 0, diaryDate: null, markedDate: null }; all.set(key, e); }
      if (kind === "watched") { e.watched = true; e.markedDate = day(r["Date"]) ?? e.markedDate; }
      else if (kind === "ratings") { e.watched = true; e.rated = stars(r["Rating"]) || e.rated; }
      else if (kind === "diary") {
        e.watched = true;
        const d = day(r["Watched Date"]) ?? day(r["Date"]);
        if (d && (!e.diaryDate || d > e.diaryDate)) { e.diaryDate = d; e.diaryRating = stars(r["Rating"]) || e.diaryRating; }
      } else e.watchlist = true;
    }
  }
  return [...all.values()].map((e) => ({ name: e.name, year: e.year, watched: e.watched, watchlist: e.watchlist && !e.watched, rating: e.rated || e.diaryRating, date: e.diaryDate ?? e.markedDate }));
}

/** Read the .csv files out of a Letterboxd export .zip, in the browser (no library: zip central directory + DecompressionStream). */
export async function readZip(buf: ArrayBuffer): Promise<{ name: string; text: string }[]> {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("That file is not a zip.");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: { name: string; text: string }[] = [];
  for (let n = 0; n < count && v.getUint32(p, true) === 0x02014b50; n++) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!name.toLowerCase().endsWith(".csv")) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = u8.subarray(start, start + size);
    let text: string;
    if (method === 0) text = dec.decode(raw);
    else if (method === 8) text = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
    else continue;
    out.push({ name, text });
  }
  return out;
}

/** A diary or review entry from a member's RSS feed. `pub` is when it was logged (ms); `watched` the day it was watched. */
export interface FeedEntry { pub: number; watched: string | null; rating: number; type: MediaType; id: number }

const grab = (block: string, tag: string) => block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`))?.[1].trim() ?? null;

/** Entries with a TMDB id (diary logs and reviews). List and other items carry no id and are skipped. */
export function parseFeed(xml: string): FeedEntry[] {
  const out: FeedEntry[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const movie = parseInt(grab(b, "tmdb:movieId") ?? "", 10), tv = parseInt(grab(b, "tmdb:tvId") ?? "", 10);
    const id = Number.isFinite(movie) ? movie : tv;
    if (!Number.isFinite(id)) continue;
    const pub = Date.parse(grab(b, "pubDate") ?? "");
    if (!Number.isFinite(pub)) continue;
    out.push({ pub, watched: day(grab(b, "letterboxd:watchedDate") ?? undefined), rating: stars(grab(b, "letterboxd:memberRating") ?? undefined), type: Number.isFinite(movie) ? "movie" : "tv", id });
  }
  return out;
}
