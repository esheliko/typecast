"use client";
import { useEffect, useMemo, useState } from "react";
import { TitleLink } from "./Modal";
import { img } from "@/lib/img";
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

const MAX = 12;
const KEY = "typecast:upnext-closed";

/** A swipeable strip of posters to watch next, above the list. Collapsible (remembered), so it never pushes the library down more than one slim row. */
export default function UpNext({ items }: { items: LibItem[] }) {
  const list = useMemo(() => candidates(items).slice(0, MAX), [items]);
  const [closed, setClosed] = useState(false);
  useEffect(() => { try { setClosed(localStorage.getItem(KEY) === "1"); } catch { /* storage unavailable */ } }, []);
  if (!list.length) return null;
  const toggle = () => setClosed((c) => { try { localStorage.setItem(KEY, c ? "0" : "1"); } catch { /* ignore */ } return !c; });
  return (
    <section className="upnext" aria-label="Watch next">
      <button type="button" className="upnext-h" aria-expanded={!closed} onClick={toggle}>
        <span className="upnext-k">Watch next</span>
        <span className="mono upnext-n">{list.length}</span>
        <span className="upnext-caret" aria-hidden="true">{closed ? "Show" : "Hide"}</span>
      </button>
      {!closed && (
        <ul className="upnext-strip">
          {list.map(({ it, why }) => (
            <li key={it.key} className="upnext-card"><TitleLink className="upnext-link" k={it.key} it={it}>
              {it.poster
                // eslint-disable-next-line @next/next/no-img-element
                ? <img className="upnext-poster" src={img(it.poster, "w185")} alt="" loading="lazy" decoding="async" />
                : <span className="upnext-poster" />}
              <span className="upnext-t">{it.title}</span>
              <span className="upnext-w">{why}</span>
            </TitleLink></li>
          ))}
        </ul>
      )}
    </section>
  );
}
