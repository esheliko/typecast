import type { CrewBy, DetailId } from "./details";

export type MediaType = "movie" | "tv";
/** What Browse shows: films, series, or both mixed together (the default). */
export type BrowseType = MediaType | "all";
export type Status = "watching" | "partial" | "watchlist" | "watched";
export type Priority = "someday" | "must";
export const PRIORITY_LABEL: Record<Priority, string> = { someday: "Some day", must: "Must watch" };
export const STATUS_LABEL: Record<Status, string> = { watching: "Watching", partial: "Partly watched", watchlist: "To watch", watched: "Watched" };

/** The one name for a mark, everywhere: a must-watch title reads "Must watch", the rest use STATUS_LABEL. */
export function markLabel(status: Status, priority?: Priority): string {
  return status === "watchlist" && priority === "must" ? PRIORITY_LABEL.must : STATUS_LABEL[status];
}

export interface Item { key: string; type: MediaType; id: number; title: string; year: string; poster: string | null }
export interface BrowseItem extends Item { rating: number }
export interface Related extends Item { rel: string }
/** `eps` / `since`: for a series, how many episodes they were in and the date of their first one. */
export interface Credit extends Item { role: string; votes: number; rating: number; date: string; eps?: number; since?: string }
/** `eps` and `credits` only for a series: episodes they appeared in, and TMDB credit ids (one per role) for looking up which. */
export interface CastMember { id: number; name: string; photo: string | null; role: string; eps?: number; credits?: string[] }
/** One episode, as listed in a season. */
export interface EpisodeLite { s: number; e: number; name: string; air: string; runtime: number | null; rating: number; votes: number; finale?: boolean }
export interface Episode extends EpisodeLite { overview: string; still: string | null; directors: string[]; writers: string[]; guests: CastMember[] }
/** Facts about a series as a whole. */
export interface ShowInfo { first: string; last: string; seasons: number; episodes: number; status: string; next: EpisodeLite | null; latest: EpisodeLite | null }
/** Where one actor turns up in one series: every episode when TMDB lists them, else just the seasons. */
export interface Appearances { roles: { role: string; eps: number }[]; total: number; episodes: EpisodeLite[]; seasons: number[]; showEpisodes: number }
export interface Provider { id: number; name: string; logo: string | null }
export interface ProviderGroup { link?: string; flatrate?: Provider[]; free?: Provider[]; ads?: Provider[]; rent?: Provider[]; buy?: Provider[] }

export interface Title extends Item {
  overview: string; tagline: string; genres: string[]; runtime: number | null; status: string;
  crew: string[]; crewBy: CrewBy; seasons: { n: number; eps: number }[]; people: CastMember[];
  prov: Record<string, ProviderGroup>; collection: number | null; related: Related[]; imdbId: string | null;
  /** Series only: show-wide facts, and everyone else who appeared (beyond `people`), for searching the cast. */
  show?: ShowInfo; extras?: CastMember[];
}
export interface Person { id: number; name: string; photo: string | null; dept: string; bio: string; known: Credit[]; imdbId: string | null }
export type BrowseList = "foryou" | "trending" | "popular" | "top" | "new" | "soon";
export type SearchHit =
  | ({ kind: "title" } & BrowseItem)
  | { kind: "person"; id: number; name: string; photo: string | null; dept: string; knownFor: string[] };

export interface LibItem extends Item {
  status: Status; priority: Priority; rating: number; note: string; progress: { s: number; e: number } | null; added: number; watchedAt: number | null;
  /** Last change to the row (status, progress, rating…), ms. Tells a series you are in the middle of from one you abandoned. */
  updated: number;
}
/** `details` is the user's chosen order of title-page sections; an id that is absent is hidden. */
export interface Profile { country: string; services: number[]; serviceNames: Record<string, string>; details: DetailId[]; letterboxd: LetterboxdLink | null }
/** The optional Letterboxd link: who, when it last checked (ms), and the last problem if any. */
export interface LetterboxdLink { user: string; syncedAt: number | null; error: string | null }

export interface EnrichedMember extends CastMember {
  hits: { key: string; title: string; year: string }[];
  also: string[];
  top: Credit[];
}

/** How the Browse tab sees a library entry: enough to draw a mark and to warn before deleting a rating or note. */
export interface Mark { status: Status; priority: Priority; rich: boolean }

export interface PersonLite { id: number; name: string; photo: string | null }
/** A title two people were both in, with the part each played. */
export interface SharedTitle extends Item { votes: number; roles: [string, string] }
/** Someone who worked with both people, and where. */
export interface Bridge { person: PersonLite; viaA: Credit; viaB: Credit }
export interface PeopleLink { a: PersonLite; b: PersonLite; shared: SharedTitle[]; bridges: Bridge[] }
/** An actor in both titles, with the part they played in each. */
export interface SharedActor extends PersonLite { roles: [string, string] }
export interface TitlesLink { a: Item; b: Item; shared: SharedActor[] }
/** An actor who keeps turning up in the user's library. */
export interface Regular extends PersonLite { titles: { key: string; title: string; role: string }[] }
