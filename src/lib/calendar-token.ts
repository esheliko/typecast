import type { LibItem } from "./types";

/** 24 random bytes as 32 URL-safe characters (192 bits): not guessable, short enough to paste. */
export function newCalendarToken(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Buffer.from(b).toString("base64url");
}

/** "<token>.ics" -> token, or null for anything that cannot be one of ours (checked before the database is asked). */
export function tokenFromFile(file: string): string | null {
  const m = /^([A-Za-z0-9_-]{32,64})\.ics$/.exec(file);
  return m ? m[1] : null;
}

/** What `calendar_library` returns, turned into library items. Anything malformed is skipped; a wrong shape gives null. */
export function feedLibrary(raw: unknown): { country: string; lib: LibItem[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { country?: unknown; items?: unknown };
  if (!Array.isArray(o.items)) return null;
  const lib: LibItem[] = [];
  for (const r of o.items as Record<string, unknown>[]) {
    const type = r?.type, id = Number(r?.id);
    if ((type !== "movie" && type !== "tv") || !Number.isInteger(id)) continue;
    lib.push({
      key: `${type}:${id}`, type, id, title: String(r.title ?? ""), year: String(r.year ?? ""), poster: null,
      status: (["watching", "partial", "watchlist", "watched"].includes(String(r.status)) ? r.status : "watchlist") as LibItem["status"],
      priority: r.priority === "must" ? "must" : "someday", rating: 0, note: "", progress: null, added: 0, watchedAt: null,
      updated: Number(r.updated) || 0,
    });
  }
  return { country: typeof o.country === "string" && o.country ? o.country : "US", lib };
}
