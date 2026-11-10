"use client";
import { createContext, useContext } from "react";
import type { WhoBrief } from "@/lib/who-data";
import type { Pos, Range, ScopeKind, WhoFace } from "@/lib/who-types";

import type { Node } from "@/lib/who-trail";
export { nodeId, nodeLabel, type Node } from "@/lib/who-trail";

/** What is being watched, as a date: the reference every gap is measured against until a row is chosen instead. */
export interface Watched { label: string; range: Range | null; /** Date for ages, and how to say it ("in this episode"). */ at: string; atLabel: string }

export interface WhoCtx {
  brief: WhoBrief;
  /** Today (YYYY-MM-DD) in the user's time zone, worked out on the server from their country. */
  today: string;
  pos: Pos | null;
  scope: ScopeKind | null;
  /** The position that cuts data off (nothing after it is shown): null while spoilers are allowed or for a film. */
  clip: Pos | null;
  /** The page-wide spoiler switch. true = spoilers allowed (everything is in scope, the whole series). */
  spoilers: boolean;
  /** "This title" as a name: "The Rookie S2E8". */
  rootLabel: string;
  faces: Map<number, WhoFace>;
  watched: Watched;
  /** Open a node from inside the right pane (adds a step to the trail). */
  push: (n: Node) => void;
  /** "We're on this one": set an exact episode. */
  setExact: (s: number, e: number) => void;
  /** Open a photo full size (the same viewer for every photo on the page). `size` is a TMDB image size. */
  zoom: (p: { path: string; name: string; size?: string }) => void;
  /** Turn on (and warm up) a person's data, e.g. on hover. */
  prefetchPerson: (id: number) => void;
}

const C = createContext<WhoCtx | null>(null);
export const WhoProvider = C.Provider;
export function useWho(): WhoCtx {
  const c = useContext(C);
  if (!c) throw new Error("useWho outside WhoApp");
  return c;
}
