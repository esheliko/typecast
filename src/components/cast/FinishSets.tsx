"use client";
import { useLib } from "./LibState";
import type { Item } from "@/lib/types";

export interface SetHint { seed: Item; label: string; keys: string[] }

/** One quiet line on the Library page: franchises you have started and not finished. Hidden when there are none. */
export default function FinishSets({ hints }: { hints: SetHint[] }) {
  const { get, openRelated } = useLib();
  const open = hints.map((h) => ({ h, left: h.keys.filter((k) => !get(k)).length })).filter((x) => x.left > 0);
  if (!open.length) return null;
  return (
    <div className="chips scroll fin" role="group" aria-label="Finish a franchise">
      <span className="fin-l">Finish</span>
      {open.map(({ h, left }) => <button key={h.label} type="button" className="chip sm" onClick={() => openRelated(h.seed)}>{h.label} · {left} left</button>)}
    </div>
  );
}
