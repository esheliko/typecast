"use client";
import { useRef } from "react";
import { TitleRow } from "../ui";
import MarkRow from "./MarkRow";
import { useRetained } from "@/lib/useRetained";
import type { Item } from "@/lib/types";

export type CreditItem = Item & { role?: string };

/**
 * The person's filmography: "In your library" first, then "Known for". Which section a title is in is decided when the page
 * opens, so unmarking something does not send it to the other section.
 */
export default function PersonCredits({ known, mineKeys }: { known: CreditItem[]; mineKeys: string[] }) {
  const split = useRef<Set<string> | null>(null);
  split.current ??= new Set(mineKeys);
  const mine = known.filter((k) => split.current!.has(k.key));
  const rest = known.filter((k) => !split.current!.has(k.key)).slice(0, 30);
  const [mineStable] = useRetained(mine);
  const [restStable] = useRetained(rest);
  const rows = (list: CreditItem[]) => <div className="card"><ul className="rows">{list.map((k) => <li key={k.key}><TitleRow it={k} sub={k.role} small /></li>)}</ul></div>;
  return (
    <>
      {mineStable.length > 0 && <><h2>In your library</h2>{rows(mineStable)}</>}
      <h2>Known for</h2>
      {rows(restStable)}
    </>
  );
}

/** Suggestion rows that stay put when you mark one (the server list drops marked titles; the row stays so you can undo it in place). */
export function SuggestionRows({ items }: { items: (Item & { why: string })[] }) {
  const [list] = useRetained(items);
  return <div className="card"><ul className="rows">{list.map((k) => <li key={k.key}><TitleRow it={k} sub={k.why} small /></li>)}</ul></div>;
}

/** "You know them from" line. Titles you unmark stay named until the page reloads, so the rows below do not shift. */
export function SeenLine({ hits }: { hits: { key: string; title: string; year?: string | number }[] }) {
  const [list] = useRetained(hits);
  if (!list.length) return null;
  return <div className="seen">You know them from: {list.slice(0, 4).map((h) => (h.year ? `${h.title} (${h.year})` : h.title)).join(", ")}</div>;
}

/** Library titles that share cast with the open title. Same rule: rows stay put when unmarked. */
export function LinkedRows({ items }: { items: (Item & { sub: string })[] }) {
  const [list] = useRetained(items);
  return <div className="card"><ul className="rows">{list.map((k) => <li key={k.key}><MarkRow it={k} sub={k.sub} small /></li>)}</ul></div>;
}
