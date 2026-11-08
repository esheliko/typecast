import { DETAIL_IDS, type DetailId } from "./details";
import type { MediaType, Priority, Status } from "./types";

/** Restoring a backup (the JSON from /api/export). Pure: validation and merge planning only, no I/O. */

export const MAX_BACKUP_ITEMS = 20000;
/** Titles per server call: keeps each request small and each read well under the 1000-row response cap. */
export const RESTORE_CHUNK = 200;

const STATUSES: Status[] = ["watching", "partial", "watchlist", "watched"];
const PRIORITIES: Priority[] = ["someday", "must"];

export interface BackupItem {
  type: MediaType; id: number; title: string; year: string; poster: string | null;
  status: Status; priority: Priority; rating: number; note: string; progress: { s: number; e: number } | null;
  /** ms since epoch; 0 when unknown */
  added: number; watchedAt: number | null;
}
export interface BackupProfile { country: string; services: number[]; serviceNames: Record<string, string>; details: DetailId[] }
export interface Backup { library: BackupItem[]; profile: BackupProfile | null }

type Fail = { ok: false; error: string };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const posInt = (v: unknown, max = 2147483647): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max;
const isMs = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 8.64e15;

/** Checks one library entry. Extra keys are ignored (a newer export may carry more); everything Typecast reads must be well formed. */
export function parseItem(raw: unknown): { ok: true; item: BackupItem } | Fail {
  if (!isObj(raw)) return { ok: false, error: "not an object" };
  const r = raw;
  if (r.type !== "movie" && r.type !== "tv") return { ok: false, error: "type must be movie or tv" };
  if (!posInt(r.id)) return { ok: false, error: "id must be a positive whole number" };
  if (r.key !== undefined && r.key !== `${r.type}:${r.id}`) return { ok: false, error: "key does not match type and id" };
  if (typeof r.title !== "string" || !r.title.trim() || r.title.length > 300) return { ok: false, error: "title must be 1–300 characters" };
  if (typeof r.year !== "string" || r.year.length > 12) return { ok: false, error: "year must be a short string" };
  if (r.poster !== null && (typeof r.poster !== "string" || r.poster.length > 200 || !r.poster.startsWith("/"))) return { ok: false, error: "poster must be a path or null" };
  if (typeof r.status !== "string" || !STATUSES.includes(r.status as Status)) return { ok: false, error: "unknown status" };
  if (typeof r.priority !== "string" || !PRIORITIES.includes(r.priority as Priority)) return { ok: false, error: "unknown priority" };
  if (typeof r.rating !== "number" || !Number.isInteger(r.rating) || r.rating < 0 || r.rating > 5) return { ok: false, error: "rating must be a whole number 0–5" };
  if (typeof r.note !== "string" || r.note.length > 5000) return { ok: false, error: "note must be text up to 5000 characters" };
  let progress: BackupItem["progress"] = null;
  if (r.progress !== null) {
    if (!isObj(r.progress) || !posInt(r.progress.s, 10000) || !posInt(r.progress.e, 100000)) return { ok: false, error: "progress must be null or {s, e} positive whole numbers" };
    progress = { s: r.progress.s, e: r.progress.e };
  }
  if (!isMs(r.added)) return { ok: false, error: "added must be a timestamp" };
  if (r.watchedAt !== null && !isMs(r.watchedAt)) return { ok: false, error: "watchedAt must be a timestamp or null" };
  return { ok: true, item: { type: r.type, id: r.id, title: r.title, year: r.year, poster: r.poster as string | null, status: r.status as Status, priority: r.priority as Priority, rating: r.rating, note: r.note, progress, added: r.added, watchedAt: r.watchedAt as number | null } };
}

export function parseProfile(raw: unknown): { ok: true; profile: BackupProfile } | Fail {
  if (!isObj(raw)) return { ok: false, error: "profile must be an object" };
  if (typeof raw.country !== "string" || !/^[A-Z]{2}$/.test(raw.country)) return { ok: false, error: "profile country must be a 2-letter code" };
  if (!Array.isArray(raw.services) || raw.services.length > 200 || !raw.services.every((x) => posInt(x))) return { ok: false, error: "profile services must be a list of ids" };
  if (!isObj(raw.serviceNames) || Object.keys(raw.serviceNames).length > 200 || !Object.entries(raw.serviceNames).every(([k, v]) => /^\d+$/.test(k) && typeof v === "string" && v.length <= 100)) return { ok: false, error: "profile serviceNames is malformed" };
  if (!Array.isArray(raw.details) || raw.details.length > DETAIL_IDS.length || !raw.details.every((x) => (DETAIL_IDS as readonly unknown[]).includes(x)) || new Set(raw.details).size !== raw.details.length) return { ok: false, error: "profile details is malformed" };
  return { ok: true, profile: { country: raw.country, services: raw.services as number[], serviceNames: raw.serviceNames as Record<string, string>, details: raw.details as DetailId[] } };
}

/** Parses the text of a backup file. Rejects anything that is not exactly the shape /api/export writes. */
export function parseBackup(text: string): { ok: true; backup: Backup } | Fail {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: "That file is not valid JSON." }; }
  if (!isObj(raw) || !Array.isArray(raw.library)) return { ok: false, error: "That doesn't look like a Typecast backup (no library list)." };
  if (raw.exportedAt !== undefined && (typeof raw.exportedAt !== "string" || Number.isNaN(Date.parse(raw.exportedAt)))) return { ok: false, error: "That doesn't look like a Typecast backup (bad exportedAt)." };
  if (raw.library.length > MAX_BACKUP_ITEMS) return { ok: false, error: `Too many titles (limit ${MAX_BACKUP_ITEMS}).` };
  const seen = new Set<string>();
  const library: BackupItem[] = [];
  for (let i = 0; i < raw.library.length; i++) {
    const r = parseItem(raw.library[i]);
    if (!r.ok) { const t = (raw.library[i] as { title?: unknown } | null)?.title; return { ok: false, error: `Title ${i + 1}${typeof t === "string" ? ` (${t.slice(0, 40)})` : ""}: ${r.error}.` }; }
    const key = `${r.item.type}:${r.item.id}`;
    if (seen.has(key)) return { ok: false, error: `Title ${i + 1} (${r.item.title.slice(0, 40)}) appears twice.` };
    seen.add(key); library.push(r.item);
  }
  let profile: BackupProfile | null = null;
  if (raw.profile !== undefined && raw.profile !== null) {
    const p = parseProfile(raw.profile);
    if (!p.ok) return p;
    profile = p.profile;
  }
  return { ok: true, backup: { library, profile } };
}

/** What a saved row holds that a restore must not clobber. */
export interface Existing { rating: number; note: string; progress_season: number | null }
export type Plan = { kind: "add" } | { kind: "fill"; fills: { rating?: number; note?: string; progress_season?: number; progress_episode?: number } } | { kind: "same" };

/** Merge rule: a missing title is added; an existing one only gets its empty rating / note / progress filled. Status, priority and anything already set stay. Never deletes. */
export function planItem(existing: Existing | undefined, inc: BackupItem): Plan {
  if (!existing) return { kind: "add" };
  const fills: { rating?: number; note?: string; progress_season?: number; progress_episode?: number } = {};
  if (!existing.rating && inc.rating > 0) fills.rating = inc.rating;
  if (!existing.note.trim() && inc.note.trim()) fills.note = inc.note;
  if (!existing.progress_season && inc.progress) { fills.progress_season = inc.progress.s; fills.progress_episode = inc.progress.e; }
  return Object.keys(fills).length ? { kind: "fill", fills } : { kind: "same" };
}

export interface Counts { added: number; filled: number; same: number }
export const addCounts = (a: Counts, b: Counts): Counts => ({ added: a.added + b.added, filled: a.filled + b.filled, same: a.same + b.same });
export const tally = (plans: Plan[]): Counts => ({ added: plans.filter((p) => p.kind === "add").length, filled: plans.filter((p) => p.kind === "fill").length, same: plans.filter((p) => p.kind === "same").length });

export const chunks = <T,>(a: T[], n = RESTORE_CHUNK): T[][] => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
