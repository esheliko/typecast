"use client";
import { createContext, useContext } from "react";
import type { WhoBrief } from "@/lib/who-data";
import type { Pos, Range, ScopeKind, WhoFace } from "@/lib/who-types";

/** One step of the trail. The first thing you see (nothing selected) is the "This title" root. */
export type Node =
  | { t: "root" }
  | { t: "person"; id: number; name: string; photo: string | null; /** Title key to highlight in the person's timeline. */ hl?: string }
  | { t: "title"; key: string; title: string; year: string; poster: string | null }
  | { t: "pair"; a: { id: number; name: string; photo: string | null }; b: { id: number; name: string; photo: string | null } };

export const nodeLabel = (n: Node) => (n.t === "root" ? "This title" : n.t === "person" ? n.name : n.t === "title" ? n.title : `${n.a.name} & ${n.b.name}`);
export const nodeId = (n: Node) => (n.t === "root" ? "root" : n.t === "person" ? `p${n.id}` : n.t === "title" ? n.key : `pair${n.a.id}-${n.b.id}`);

/** What is being watched, as a date: the reference every gap is measured against until a row is chosen instead. */
export interface Watched { label: string; range: Range | null; /** Date for ages, and how to say it ("in this episode"). */ at: string; atLabel: string }

export interface WhoCtx {
  brief: WhoBrief;
  pos: Pos | null;
  scope: ScopeKind | null;
  faces: Map<number, WhoFace>;
  watched: Watched;
  /** Open a node from inside the right pane (adds a step to the trail). */
  push: (n: Node) => void;
  /** "We're on this one": set an exact episode. */
  setExact: (s: number, e: number) => void;
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
