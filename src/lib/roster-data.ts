import { enrich } from "./enrich";
import { movieFaces, seriesFaces, type EpGuests, type Face } from "./roster";
import { getAllCredits, getFullCast, getSeason, getTitle, search } from "./tmdb";
import type { Credit, LibItem, MediaType, Status } from "./types";

/** Server side of "Who's that?": who can be on screen, where the user knows each from, and a person's other work. */
export interface Roster { key: string; type: MediaType; seasons: { n: number; eps: number }[]; s: number | null; e: number | null; faces: Face[]; note?: string }

/** Everyone who can be on screen at this point. A series never shows a guest from a later episode. */
export async function loadRoster(type: MediaType, id: number, pos: { s: number; e: number } | null): Promise<Roster> {
  if (type === "movie") {
    return { key: `movie:${id}`, type, seasons: [], s: null, e: null, faces: movieFaces(await getFullCast(id)).slice(0, 160) };
  }
  const t = await getTitle("tv", id);
  const seasons = t.seasons;
  const s = Math.min(pos?.s ?? 1, seasons.length ? Math.max(...seasons.map((x) => x.n)) : 1);
  const e = Math.max(1, pos?.e ?? 1);
  // One call per season up to the current one (cached 6h): guest stars of every episode that has already happened.
  const wanted = seasons.filter((x) => x.n <= s).map((x) => x.n).slice(-6);
  const eps: EpGuests[] = (await Promise.all(wanted.map((n) => getSeason(id, n, { selves: true }).catch(() => null))))
    .flatMap((r, i) => (r ? r.episodes.map((x) => ({ s: wanted[i], e: x.e, guests: x.guests })) : []));
  const faces = seriesFaces(eps, { s, e }, t.people.slice(0, 24));
  const seen = new Set(faces.map((f) => f.id));
  // Everyone else in the series cast: only found by searching, since they may belong to episodes not yet reached.
  const other = (t.extras ?? []).filter((x) => !seen.has(x.id)).slice(0, 200).map((x): Face => ({ id: x.id, name: x.name, photo: x.photo, role: x.role, part: "other" }));
  return { key: t.key, type, seasons, s, e, faces: [...faces, ...other], ...(eps.length ? {} : { note: "TMDB has no guest list for these episodes yet, so only the regular cast is shown." }) };
}

/** For the faces asked about: the titles in the user's library they were in (the quick "you know them from"). */
export async function loadHits(ids: number[], lib: LibItem[], curKey: string) {
  const people = ids.slice(0, 24).map((id) => ({ id, name: "", photo: null, role: "" }));
  const rich = await enrich(people, lib, curKey);
  return Object.fromEntries(rich.map((p) => [p.id, p.hits.slice(0, 4)]));
}

const SEEN: Status[] = ["watched", "watching", "partial"];
export interface PersonBrief {
  id: number; name: string; photo: string | null; total: number;
  /** Titles in the library they were in, then what they are best known for. */
  seen: Credit[]; listed: Credit[]; famous: Credit[];
}

/** One person: what the user has seen them in, what is on their list, and their best-known work. The current title is left out. */
export async function loadPerson(id: number, lib: LibItem[], curKey: string): Promise<PersonBrief> {
  const p = await getAllCredits(id);
  const st = new Map(lib.map((l) => [l.key, l.status]));
  const others = p.known.filter((k) => k.key !== curKey);
  return {
    id: p.id, name: p.name, photo: p.photo, total: others.length,
    seen: others.filter((k) => SEEN.includes(st.get(k.key)!)).slice(0, 6),
    listed: others.filter((k) => st.get(k.key) === "watchlist").slice(0, 3),
    famous: others.filter((k) => !st.has(k.key)).slice(0, 6),
  };
}

/** People anywhere on TMDB by name, for a face that is not in the lists. */
export async function findPeople(q: string): Promise<{ id: number; name: string; photo: string | null; role: string }[]> {
  const hits = await search(q, "person");
  return hits.flatMap((h) => (h.kind === "person" ? [{ id: h.id, name: h.name, photo: h.photo, role: h.knownFor.slice(0, 2).join(", ") }] : [])).slice(0, 8);
}
