import type { MediaType } from "./types";
import type { HiddenLine } from "./spoiler-line";

/**
 * Shared shapes for the /who experience ("Watching now" redesign). Pure types, safe for server and client.
 * Position: `s`/`e` null mean "not sure". A film has no position.
 */
export interface Pos { s: number | null; e: number | null }
export type ScopeKind = "exact" | "season" | "all";

/** Where someone sits in the face grid. `episode` and `earlier` only exist for an exact position, `guest` for a fuzzy one. */
export type WhoPart = "episode" | "main" | "earlier" | "guest";

/** TMDB gender: 0 unknown, 1 female, 2 male, 3 non-binary. */
export type Gender = 0 | 1 | 2 | 3;

export interface WhoFace {
  id: number; name: string; photo: string | null; g: Gender;
  /** Characters played in scope ("Nell Forester / Dr. Sawyer"). */
  role: string;
  part: WhoPart;
  /** Episodes in scope. For a regular this is only what TMDB's season totals add up to (not shown). */
  n: number;
  /** Their latest appearance in scope as season and episode (the episode is 999 when only the season is known). Ranks "Seen earlier". */
  ls: number; le: number;
  /** TMDB credit ids for the parts they played (a few), to look up exactly which episodes. */
  cids: string[];
}

/** One person as a season lists them. */
export interface SeasonPerson { id: number; name: string; photo: string | null; g: Gender; role: string }
export interface AggPerson extends SeasonPerson { total: number; cids: string[] }
export interface SeasonEpisode {
  e: number; name: string; air: string; runtime: number | null; still: string | null;
  guests: (SeasonPerson & { cid?: string })[];
}
/** What building a roster needs from each season (see who-data.ts for where it comes from). */
export interface SeasonData {
  n: number; air: string;
  episodes: SeasonEpisode[];
  /** Everyone TMDB credits in the season, with episode totals (guests included). */
  agg: AggPerson[];
  /** The season's regular cast. */
  regulars: SeasonPerson[];
}

export interface WhoRoster {
  key: string; type: MediaType; pos: Pos | null; scope: ScopeKind | null;
  faces: WhoFace[];
  /** What the scope includes, in words, when it is wider than the position (a season only, the whole series). */
  note: string | null;
  /** Set when TMDB had nothing for some seasons, so the list may be short. */
  partial: boolean;
}

/** A person's credit, from TMDB's combined credits, merged per title. */
export interface PCredit {
  key: string; type: MediaType; id: number; title: string; year: string; poster: string | null;
  role: string;
  /** TMDB's release date (film) or this person's first credited air date (series). Used to order rows before their own dates load. */
  date: string;
  /** Series: episodes they were in (TMDB's count) and the credit ids to look up which. */
  eps: number; cids: string[];
  /** A talk show, news show, or the person playing themselves: hidden unless asked for. */
  extra: boolean;
  /** TMDB popularity-ish votes, for "best known". */
  votes: number;
  /** Billing position in the cast (0 = top billed), lowest across parts; absent when TMDB or an older cache lacks it. */
  order?: number;
}

export interface PersonData {
  id: number; name: string; photo: string | null; g: Gender;
  birthday: string; deathday: string; place: string;
  images: string[];
  credits: PCredit[];
}

/** A date range, ISO "YYYY-MM-DD" (or "YYYY-MM", "YYYY"). end >= start. */
export interface Range { start: string; end: string }

/** The person's own first-to-last episode dates in one series, or the show's run when TMDB has no episode list. */
export interface Span {
  key: string;
  /** "own": from their episode air dates. "run": TMDB has no usable episode list, so this is the show's own run. */
  kind: "own" | "run";
  start: string; end: string;
  /** Episodes listed (0 for a run). */
  n: number;
  eps: { s: number; e: number; air: string }[];
  /** The whole show's run, for "2009-2017" beside its name (absent for the show being watched, whose end is never given away). */
  show?: ShowRun;
  /** Set when the spoiler line of this series cuts the dates (Watching in the library): what is here stops at the saved place, or is empty with no place. */
  hidden?: HiddenLine;
}
/** A series' own first and last air dates, and whether it is still going. */
export interface ShowRun { first: string; last: string; ongoing: boolean }
