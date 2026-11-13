import { allowsEpisode, type SpoilerLine } from "./spoiler-line";

/** One face on an episode row: just enough to draw a round photo and a name. */
export interface Face { id: number; name: string; photo: string | null }
/** One episode's line on the list: up to 3 faces, the names to print and how many more there are. `hidden` = past the saved place: nothing about its cast is sent. */
export type EpisodeFaces = { e: number; hidden: true } | { e: number; hidden?: undefined; faces: Face[]; names: string[]; more: number };

export const MAX_FACES = 3;

/**
 * Per-episode faces for one season under the spoiler line (docs/features/series.md). Episodes the line does not allow come back as `{ hidden: true }`
 * and their guests are never looked at, so nothing about who is in a later episode leaves the server. Faces without a photo still count in the names.
 */
export function episodeFaces(season: number, eps: { e: number; guests: { id: number; name: string; photo: string | null }[] }[], line: SpoilerLine): EpisodeFaces[] {
  return eps.map((x): EpisodeFaces => {
    if (!allowsEpisode(line, season, x.e)) return { e: x.e, hidden: true };
    const seen = new Set<number>();
    const guests = x.guests.filter((g) => !seen.has(g.id) && !!seen.add(g.id));
    const top = guests.slice(0, MAX_FACES);
    return { e: x.e, faces: top.map((g) => ({ id: g.id, name: g.name, photo: g.photo })), names: top.map((g) => g.name.split(" ")[0]), more: guests.length - top.length };
  });
}

/** "Mara, Tomas +2" (the first names, then how many more). */
export const facesText = (f: { names: string[]; more: number }): string => f.names.join(", ") + (f.more > 0 ? ` +${f.more}` : "");
