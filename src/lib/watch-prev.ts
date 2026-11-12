import type { PrevRecord } from "./watch-library";
import type { MediaType } from "./types";

/**
 * Device-local memory of titles a watch promoted from Partly watched (`typecast.watchPrev.<key>`), so they can go back to Partly after a day of no watching.
 * Best effort: every storage call is in try/catch and a failure just means nothing is remembered. No migration, nothing server side.
 */
const PREFIX = "typecast.watchPrev.";
export interface PrevItem extends PrevRecord { type: MediaType; id: number; title: string; year: string; poster: string | null }

export function rememberPartly(it: { key: string; type: MediaType; id: number; title: string; year: string; poster: string | null }, now = Date.now()) {
  try { localStorage.setItem(PREFIX + it.key, JSON.stringify({ prev: "partial", lastActive: now, type: it.type, id: it.id, title: it.title, year: it.year, poster: it.poster } satisfies PrevItem)); } catch { /* not remembered */ }
}

/** The title is being used right now: push the inactivity clock back. Does nothing when there is no record. */
export function refreshPartly(key: string, now = Date.now()) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return;
    const r = JSON.parse(raw) as PrevItem;
    r.lastActive = now;
    localStorage.setItem(PREFIX + key, JSON.stringify(r));
  } catch { /* the record stays as it was */ }
}

export function forgetPartly(key: string) { try { localStorage.removeItem(PREFIX + key); } catch { /* nothing to forget */ } }

/** All stored records, malformed ones skipped. */
export function readPartly(): { key: string; rec: PrevItem }[] {
  const out: { key: string; rec: PrevItem }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      try {
        const r = JSON.parse(localStorage.getItem(k) ?? "") as PrevItem;
        if (r && r.prev === "partial" && typeof r.lastActive === "number" && (r.type === "tv" || r.type === "movie") && Number.isInteger(r.id) && typeof r.title === "string")
          out.push({ key: k.slice(PREFIX.length), rec: r });
      } catch { /* skip */ }
    }
  } catch { /* storage unavailable */ }
  return out;
}

/* The "Finished?" prompts (film clock, last episode of an ended series) appear at most once per watch: dismissing or using one remembers it until the watch ends. */
const PROMPT = "typecast.watchPrompt.";
export function promptDone(key: string): boolean { try { return !!localStorage.getItem(PROMPT + key); } catch { return false; } }
export function markPromptDone(key: string) { try { localStorage.setItem(PROMPT + key, "1"); } catch { /* it may show again */ } }
export function clearPrompt(key: string) { try { localStorage.removeItem(PROMPT + key); } catch { /* nothing to clear */ } }
