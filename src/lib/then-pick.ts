import { getJson } from "./who-client";
import type { ThenWho } from "./then-photo";

/** Browser side of the "Then" photo: the server picks it (`/api/glimpse/then`, which can read the pixels of any host) and never returns the Now photo. `url` null keeps the profile photo; `configured: false` means no image search. */
export function fetchThen(q: string, profilePath: string | null | undefined, who: ThenWho, at?: { tv: number; imdb: string | null; s: number | null; e: number | null } | null): Promise<{ configured: boolean; url: string | null }> {
  const a = new URLSearchParams({ q, now: profilePath ?? "", actor: who.actor, char: who.char ?? "", title: who.title ?? "", v: "5" });
  if (at?.tv && at.s && at.e) { a.set("tv", String(at.tv)); a.set("s", String(at.s)); a.set("e", String(at.e)); if (at.imdb) a.set("imdb", at.imdb); }
  return getJson<{ configured?: boolean; url?: string | null }>(`/api/glimpse/then?${a}`).then((r) => ({ configured: r.configured !== false, url: r.url ?? null }));
}
