"use client";
import { useCallback, useRef } from "react";

/**
 * A list that never loses or reorders rows while it is on screen. Rows that vanish from `items` (you unmarked a title and the server
 * list no longer has it) stay where they were, so you can mark them again without hunting. Rows that are new go to the start or end.
 * `reset` forgets everything not in `items`; call it when the user deliberately changes view (a filter, say).
 */
export function useRetained<T extends { key: string }>(items: T[], fresh: "start" | "end" = "end"): [T[], () => void] {
  const ref = useRef<T[]>([]);
  const now = new Map(items.map((i) => [i.key, i]));
  const had = new Set(ref.current.map((p) => p.key));
  const kept = ref.current.map((p) => now.get(p.key) ?? p);
  const added = items.filter((i) => !had.has(i.key));
  const next = fresh === "start" ? [...added, ...kept] : [...kept, ...added];
  ref.current = next;
  const reset = useCallback(() => { ref.current = []; }, []);
  return [next, reset];
}
