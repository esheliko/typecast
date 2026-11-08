import type { MediaType } from "./types";

/**
 * "Watching now": the one title the user is in the middle of right now. Kept in a cookie (this device only, ends by itself
 * after 12 hours) so the layout can draw the Watching-now bar without waiting on anything, and the Ask sheet knows how far in they are.
 */
export const WATCH_COOKIE = "tc_watch";
export const WATCH_MAX_MS = 12 * 3600 * 1000;

export interface Watch {
  key: string; type: MediaType; id: number; title: string; year: string; poster: string | null;
  /** When the watch started (ms). Moved by the "I'm further in / not as far" buttons, so elapsed time stays right after a pause. */
  started: number;
  /** Runtime in minutes (per episode for a series), when known. */
  runtime: number | null;
  /** Series only: the episode being watched. */
  s?: number; e?: number;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined);

/** Reads a stored watch, or null when it is missing, malformed or older than 12 hours. */
export function parseWatch(raw: string | undefined | null, now = Date.now()): Watch | null {
  if (!raw) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(raw.startsWith("%7B") ? decodeURIComponent(raw) : raw); } catch { return null; }
  if (!j || typeof j !== "object") return null;
  const type = j.type === "movie" || j.type === "tv" ? j.type : null;
  const id = int(j.id), started = int(j.started);
  if (!type || !id || !started || now - started > WATCH_MAX_MS || started > now + 60_000) return null;
  const w: Watch = { key: `${type}:${id}`, type, id, title: str(j.title, 200), year: str(j.year, 4), poster: str(j.poster, 120) || null, started, runtime: int(j.runtime) || null };
  if (type === "tv") { w.s = int(j.s) || 1; w.e = int(j.e) || 1; }
  return w;
}

export const serializeWatch = (w: Watch) => encodeURIComponent(JSON.stringify(w));

/** Whole minutes since the watch started, never negative. */
export const elapsedMin = (w: Pick<Watch, "started">, now = Date.now()) => Math.max(0, Math.floor((now - w.started) / 60000));

/** "S2 E5", "42 min in", "42 of 120 min". */
export function whereLabel(w: Watch, now = Date.now()): string {
  const m = elapsedMin(w, now);
  const t = w.runtime ? `${Math.min(m, w.runtime)} of ${w.runtime} min` : `${m} min in`;
  return w.type === "tv" ? `S${w.s} E${w.e} · ${t}` : t;
}

/** One line for the assistant: how far the user is, so it can keep quiet about what comes after. */
export function spoilerPoint(w: Watch, now = Date.now()): string {
  const m = elapsedMin(w, now);
  const of = w.runtime ? ` of about ${w.runtime}` : "";
  return w.type === "tv"
    ? `They are watching season ${w.s}, episode ${w.e}, roughly ${m} minutes into the episode${of}.`
    : `They are roughly ${m} minutes into the film${of}.`;
}

/** One-tap questions for the Ask sheet. Phrased the way a person would ask out loud. */
export function quickQuestions(type: MediaType): string[] {
  const common = [
    "Where do I know the cast from?",
    "Which of the cast have worked together before?",
    "Is this based on a true story?",
    "Where was this filmed?",
    "Who did the music?",
    "Tell me some trivia (no spoilers)",
  ];
  return type === "tv"
    ? ["Recap the story so far, up to this episode", ...common, "How many episodes are left this season?"]
    : ["Recap the story so far (no spoilers past this point)", ...common, "Is there a post-credits scene?"];
}
