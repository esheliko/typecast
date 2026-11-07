export type MediaType = "movie" | "tv";
export type Status = "watching" | "watchlist" | "watched";
export type Priority = "someday" | "must";
export const PRIORITY_LABEL: Record<Priority, string> = { someday: "Some day", must: "Must watch" };
export const STATUS_LABEL: Record<Status, string> = { watching: "Watching", watchlist: "To watch", watched: "Watched" };

export interface Item { key: string; type: MediaType; id: number; title: string; year: string; poster: string | null }
export interface BrowseItem extends Item { rating: number }
export interface Related extends Item { rel: string }
export interface Credit extends Item { role: string; votes: number }
export interface CastMember { id: number; name: string; photo: string | null; role: string }
export interface Provider { id: number; name: string; logo: string | null }
export interface ProviderGroup { link?: string; flatrate?: Provider[]; free?: Provider[]; ads?: Provider[]; rent?: Provider[]; buy?: Provider[] }

export interface Title extends Item {
  overview: string; tagline: string; genres: string[]; runtime: number | null; status: string;
  crew: string[]; seasons: { n: number; eps: number }[]; people: CastMember[];
  prov: Record<string, ProviderGroup>; collection: number | null; related: Related[];
}
export interface Person { id: number; name: string; photo: string | null; dept: string; bio: string; known: Credit[] }
export type BrowseList = "trending" | "popular" | "top" | "new" | "soon";
export type SearchHit =
  | ({ kind: "title" } & BrowseItem)
  | { kind: "person"; id: number; name: string; photo: string | null; dept: string; knownFor: string[] };

export interface LibItem extends Item {
  status: Status; priority: Priority; rating: number; note: string; progress: { s: number; e: number } | null; added: number;
}
export interface Profile { country: string; services: number[]; serviceNames: Record<string, string> }

export interface EnrichedMember extends CastMember {
  hits: { key: string; title: string; year: string }[];
  also: string[];
  top: Credit[];
}

/** How the cast tab sees a library entry: enough to draw a mark and to warn before deleting a rating or note. */
export interface Mark { status: Status; rich: boolean }

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
