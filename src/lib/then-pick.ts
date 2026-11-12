import { getJson } from "./who-client";
import type { ThenWho } from "./then-photo";

/** Browser side of the "Then" photo: the server picks it (`/api/glimpse/then`, which can read the pixels of any host) and never returns the Now photo. `url` null keeps the profile photo; `configured: false` means no image search. */
export function fetchThen(q: string, profilePath: string | null | undefined, who: ThenWho): Promise<{ configured: boolean; url: string | null }> {
  const a = new URLSearchParams({ q, now: profilePath ?? "", actor: who.actor, char: who.char ?? "", title: who.title ?? "", v: "3" });
  return getJson<{ configured?: boolean; url?: string | null }>(`/api/glimpse/then?${a}`).then((r) => ({ configured: r.configured !== false, url: r.url ?? null }));
}
