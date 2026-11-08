import type { Appearances, EpisodeLite, ShowInfo } from "./types";

/** Pure helpers for series: dates, episode codes and the one-line answers ("62 episodes", "Seasons 1–3"). Shared by server and client. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2011-10-09" -> "9 Oct 2011". Dates are calendar days, so they are read as UTC to avoid shifting a day. */
export function fmtDate(iso: string, withDay = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${withDay ? DAYS[d.getUTCDay()] + " " : ""}${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Whole days from `today` (YYYY-MM-DD) to `iso`; negative when it is past. */
export function daysUntil(iso: string, today: string): number {
  const a = Date.parse(iso.slice(0, 10) + "T00:00:00Z"), b = Date.parse(today.slice(0, 10) + "T00:00:00Z");
  return Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.round((a - b) / 86400000);
}

/** "today", "tomorrow", "in 5 days", "in 3 weeks"… for an upcoming air date; "" when it is past or unknown. */
export function untilLabel(iso: string, today: string): string {
  const n = daysUntil(iso, today);
  if (!(n >= 0)) return "";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n < 14) return `in ${n} days`;
  if (n < 60) return `in ${Math.round(n / 7)} weeks`;
  return `in ${Math.round(n / 30)} months`;
}

/** Has this episode aired by `today`? An episode without a date has not. */
export const aired = (e: { air: string }, today: string) => !!e.air && daysUntil(e.air, today) <= 0;

export const epCode = (s: number, e: number) => `S${s} E${e}`;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2008–2013", "2019–" (still running) or "2021" (one year). */
export function yearSpan(first: string, last: string, running: boolean): string {
  const a = first.slice(0, 4), b = last.slice(0, 4);
  if (!a) return "";
  if (running) return `${a}–`;
  return !b || a === b ? a : `${a}–${b}`;
}

const RUNNING = new Set(["Returning Series", "In Production", "Planned", "Pilot"]);
export const isRunning = (status: string) => RUNNING.has(status);

/** "5 seasons · 62 episodes · 2008–2013 · Ended". */
export function showLine(s: ShowInfo): string {
  const running = isRunning(s.status);
  return [
    s.seasons ? plural(s.seasons, "season") : "", s.episodes ? plural(s.episodes, "episode") : "",
    yearSpan(s.first, s.last, running), s.status === "Canceled" ? "Cancelled" : s.status === "Ended" ? "Ended" : running ? "Still running" : "",
  ].filter(Boolean).join(" · ");
}

/** "Seasons 1–3", "Season 2", "Seasons 1, 3, 5". */
export function seasonsLabel(ns: number[]): string {
  if (!ns.length) return "";
  if (ns.length === 1) return `Season ${ns[0]}`;
  const contiguous = ns.every((n, i) => i === 0 || n === ns[i - 1] + 1);
  return `Seasons ${contiguous ? `${ns[0]}–${ns[ns.length - 1]}` : ns.join(", ")}`;
}

/** Next to a cast name in a series: "62 eps", or "every episode" when they are in all of them. */
export function epsLabel(eps: number | undefined, showEpisodes?: number): string {
  if (!eps) return "";
  if (showEpisodes && eps >= showEpisodes && eps > 1) return "every episode";
  return eps === 1 ? "1 ep" : `${eps} eps`;
}

/** On a person's filmography row: "3 episodes, from 2011". The year is left out when it is the show's own first year. */
export function creditSub(role: string, eps?: number, since?: string, showDate?: string): string {
  const parts = [role];
  if (eps) {
    const from = since && since.slice(0, 4) !== (showDate ?? "").slice(0, 4) ? `, from ${since.slice(0, 4)}` : "";
    parts.push(`${plural(eps, "episode")}${from}`);
  }
  return parts.filter(Boolean).join(" · ");
}

/** The summary above someone's episode list: "3 episodes · 2011–2013 · Seasons 4–5". */
export function appearanceLine(a: Appearances): string {
  const n = a.total || a.episodes.length;
  const every = a.showEpisodes > 1 && n >= a.showEpisodes;
  const dates = a.episodes.map((e) => e.air).filter(Boolean).sort();
  const span = dates.length ? yearSpan(dates[0], dates[dates.length - 1], false) : "";
  return [every ? `Every episode (${a.showEpisodes})` : n ? plural(n, "episode") : "", span, seasonsLabel(a.seasons)].filter(Boolean).join(" · ");
}

/** The episode just after `p` in a list of episodes in order (or the first one, with no progress). */
export function nextAfter<T extends EpisodeLite>(list: T[], p: { s: number; e: number } | null): T | null {
  if (!p) return list[0] ?? null;
  return list.find((x) => x.s > p.s || (x.s === p.s && x.e > p.e)) ?? null;
}

/** Is episode `x` at or before the user's progress? */
export const upTo = (x: { s: number; e: number }, p: { s: number; e: number } | null) => !!p && (x.s < p.s || (x.s === p.s && x.e <= p.e));

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * When an upcoming episode airs, to follow "New episode": "today", "tomorrow", "Thursday" (within the week), "on 12 Nov".
 * "" when it is past or the date is unknown.
 */
export function airsLabel(iso: string, today: string): string {
  const n = daysUntil(iso, today);
  if (!(n >= 0)) return "";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n < 7) return WEEKDAYS[new Date(iso.slice(0, 10) + "T00:00:00Z").getUTCDay()];
  const d = fmtDate(iso);
  return `on ${today.slice(0, 4) === iso.slice(0, 4) ? d.slice(0, -5) : d}`;
}

/** The episode just before `x` (the last of the previous season for an E1), or null before the first. Specials (0) are skipped. */
export function prevEpisode(x: { s: number; e: number }, seasons: { n: number; eps: number }[]): { s: number; e: number } | null {
  if (x.e > 1) return { s: x.s, e: x.e - 1 };
  const before = seasons.filter((n) => n.n > 0 && n.n < x.s && n.eps > 0).sort((a, b) => b.n - a.n)[0];
  return before ? { s: before.n, e: before.eps } : null;
}

/**
 * Where you saw someone in a series you have in your library, from the episodes they were in: `{ ep }` names it
 * ("S4 E13 “Face Off”", or "3 episodes"), `{}` when it cannot be told, and null when your progress has not reached any of
 * their episodes yet (so the series is not where you know them from). A series marked Watched counts every episode.
 */
export function seenIn(eps: EpisodeLite[], l: { status: string; progress: { s: number; e: number } | null }): { ep?: string } | null {
  if (!eps.length) return {};
  const seen = l.status === "watched" && !l.progress ? eps : l.progress ? eps.filter((x) => upTo(x, l.progress)) : null;
  if (!seen) return {};
  if (!seen.length) return l.status === "watched" ? {} : null;
  const one = seen[0];
  return { ep: seen.length === 1 ? `${epCode(one.s, one.e)}${one.name ? ` “${one.name}”` : ""}` : plural(seen.length, "episode") };
}
