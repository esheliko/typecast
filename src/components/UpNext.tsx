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

const SHOWN = 4;

/** A few things to watch next from the library, shown above the list. "More" moves on to the next few. */
export default function UpNext({ items }: { items: LibItem[] }) {
  const list = useMemo(() => candidates(items), [items]);
  const [page, setPage] = useState(0);
  if (!list.length) return null;
  const pages = Math.ceil(list.length / SHOWN);
  const start = (page % pages) * SHOWN;
  const view = list.slice(start, start + SHOWN);
  return (
    <section className="card upnext" aria-label="Watch next">
      <div className="upnext-h"><span className="upnext-k">Watch next</span>
        {pages > 1 && <button type="button" className="chip sm" onClick={() => setPage((n) => n + 1)}>More</button>}
      </div>
      <ul className="rows">
        {view.map(({ it, why }) => (
          <li key={it.key} className="row"><TitleLink className="row-link" k={it.key} it={it}>
            <Thumb path={it.poster} />
            <span className="row-main">
              <span className="row-title" style={{ fontSize: 17 }}>{it.title}</span>
              <span className="row-sub">{it.year} · {typeLabel(it.type)} · {why}</span>
            </span>
          </TitleLink></li>
        ))}
      </ul>
    </section>
  );
}
