export type MediaType = "movie" | "tv";
export type Status = "watching" | "watchlist" | "watched";
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
export type SearchHit =
  | ({ kind: "title" } & Item)
  | { kind: "person"; id: number; name: string; photo: string | null; dept: string; knownFor: string[] };

export interface LibItem extends Item {
  status: Status; rating: number; note: string; progress: { s: number; e: number } | null; added: number;
}
export interface Profile { country: string; services: number[]; serviceNames: Record<string, string> }

export interface EnrichedMember extends CastMember {
  hits: { key: string; title: string; year: string }[];
  also: string[];
  top: Credit[];
}
