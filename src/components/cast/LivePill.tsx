"use client";
import { useLib } from "./LibState";
import { markLabel } from "@/lib/types";

/** The status label for a title, following marks as you change them. Reserves nothing when empty; rows put it at the line's end. */
export default function LivePill({ k }: { k: string }) {
  const m = useLib().get(k);
  return m ? <span className={`pill ${m.status === "watchlist" && m.priority === "must" ? "must" : m.status}`}>{markLabel(m.status, m.priority)}</span> : null;
}
