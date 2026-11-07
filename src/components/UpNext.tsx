"use client";
import { useMemo, useState } from "react";
import { TitleLink } from "./Modal";
import { Thumb } from "./ui";
import { typeLabel } from "@/lib/img";
import type { LibItem } from "@/lib/types";

/** Candidates for the next watch, best first: things already under way, then must-watch, then the rest of the watchlist (oldest first). */
function candidates(items: LibItem[]): { it: LibItem; why: string }[] {
  const out: { it: LibItem; why: string }[] = [];
  items.filter((l) => l.status === "watching").forEach((it) => out.push({ it, why: it.progress ? `Continue from S${it.progress.s} E${it.progress.e}` : "You're watching this" }));
  items.filter((l) => l.status === "partial").forEach((it) => out.push({ it, why: it.progress ? `Pick up at S${it.progress.s} E${it.progress.e}` : "Partly watched" }));
  const wl = items.filter((l) => l.status === "watchlist").sort((a, b) => a.added - b.added);
  wl.filter((l) => l.priority === "must").forEach((it) => out.push({ it, why: "On your must-watch list" }));
  wl.filter((l) => l.priority !== "must").forEach((it) => out.push({ it, why: "Waiting on your watchlist" }));
  return out;
}

/** One suggested next watch from the library, shown above the list. "Another" steps through the rest. */
export default function UpNext({ items }: { items: LibItem[] }) {
  const list = useMemo(() => candidates(items), [items]);
  const [i, setI] = useState(0);
  if (!list.length) return null;
  const { it, why } = list[i % list.length];
  return (
    <section className="card upnext" aria-label="Up next">
      <div className="upnext-h"><span className="upnext-k">Up next</span>
        {list.length > 1 && <button type="button" className="chip sm" onClick={() => setI((n) => n + 1)}>Another</button>}
      </div>
      <TitleLink className="row-link" k={it.key} it={it}>
        <Thumb path={it.poster} />
        <span className="row-main">
          <span className="row-title">{it.title}</span>
          <span className="row-sub">{it.year} · {typeLabel(it.type)}</span>
          <span className="row-sub">{why}</span>
        </span>
      </TitleLink>
    </section>
  );
}
