/**
 * Minimal iCalendar (RFC 5545) writer for "Add to calendar" and the subscribable feed. Pure. Dates from TMDB are calendar days, so
 * they become all-day events (DTSTART;VALUE=DATE), which every calendar shows on that day in any time zone. A timed event
 * (`startUtc`) is written in UTC ("Z"), which is also time-zone safe.
 */
export interface IcsEvent {
  uid: string;
  summary: string;
  /** All-day: YYYY-MM-DD. */
  date?: string;
  /** Timed: UTC milliseconds. Used when `date` is absent. */
  startUtc?: number;
  /** Timed events only. Default 60. */
  minutes?: number;
  description?: string;
  url?: string;
}

const enc = new TextEncoder();

/** TEXT values: backslash, semicolon and comma are escaped, newlines become \n. */
export function escapeText(s: string): string {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** Lines are at most 75 octets; longer ones continue on the next line after CRLF and one space. Never splits a multi-byte character. */
export function fold(line: string): string {
  const parts: string[] = [];
  let cur = "", bytes = 0, limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) { parts.push(cur); cur = ""; bytes = 0; limit = 74; }
    cur += ch; bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const compactDay = (iso: string) => iso.slice(0, 10).replace(/-/g, "");

/** The day after a YYYY-MM-DD day (DTEND of an all-day event is exclusive). */
export function nextDay(iso: string): string {
  const d = new Date(Date.parse(iso.slice(0, 10) + "T00:00:00Z") + 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 20261218T190000Z */
export function utcStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** A UID that stays the same for the same title/episode, so a calendar updates the event instead of adding a copy. */
export function eventUid(type: "movie" | "tv", id: number, s?: number, e?: number): string {
  return `${type === "movie" ? "film" : "tv"}-${id}${type === "tv" && s != null && e != null ? `-s${s}e${e}` : ""}@typecast`;
}

function eventLines(ev: IcsEvent, stamp: number): string[] {
  const out = ["BEGIN:VEVENT", `UID:${ev.uid}`, `DTSTAMP:${utcStamp(stamp)}`];
  if (ev.date && /^\d{4}-\d{2}-\d{2}/.test(ev.date)) {
    out.push(`DTSTART;VALUE=DATE:${compactDay(ev.date)}`, `DTEND;VALUE=DATE:${compactDay(nextDay(ev.date))}`, "TRANSP:TRANSPARENT");
  } else if (ev.startUtc != null) {
    out.push(`DTSTART:${utcStamp(ev.startUtc)}`, `DTEND:${utcStamp(ev.startUtc + (ev.minutes ?? 60) * 60000)}`);
  } else throw new Error("An event needs a date or a start time.");
  out.push(`SUMMARY:${escapeText(ev.summary)}`);
  if (ev.description) out.push(`DESCRIPTION:${escapeText(ev.description)}`);
  if (ev.url) out.push(`URL:${ev.url.replace(/[\r\n]/g, "")}`);
  out.push("END:VEVENT");
  return out;
}

/** A whole calendar file, CRLF line endings, folded. An event that cannot be written is skipped. */
export function buildCalendar(events: IcsEvent[], opts: { stamp: number; name?: string; feed?: boolean }): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Typecast//Upcoming//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  if (opts.name) lines.push(`X-WR-CALNAME:${escapeText(opts.name)}`);
  if (opts.feed) lines.push("REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H");
  for (const ev of events) { try { lines.push(...eventLines(ev, opts.stamp)); } catch { /* skip */ } }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** A safe file name: "dune-part-three.ics". */
export function icsFileName(title: string): string {
  const base = title.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 60);
  return `${base || "typecast"}.ics`;
}
