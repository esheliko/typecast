"use client";
import { useLib } from "./LibState";
import type { Item } from "@/lib/types";

/** A small icon button on a title you have seen: opens the rest of its collection or universe to mark. Shows nothing for unseen titles. */
export default function RelatedButton({ it }: { it: Item }) {
  const { get, openRelated } = useLib();
  const s = get(it.key)?.status;
  if (s !== "watched" && s !== "partial") return null;
  return (
    <button type="button" className="rel-b" onClick={() => openRelated(it)} aria-label={`Related to ${it.title}`} title="Related titles">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3.5" width="12" height="14" rx="2" /><path d="M5 7.5v11a2 2 0 0 0 2 2h9" /></svg>
    </button>
  );
}
