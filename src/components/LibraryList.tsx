"use client";
import { TitleLink } from "./Modal";
import { GlimpseButton } from "./Glimpse";
import { titleSpec } from "@/lib/glimpse";
import { useState } from "react";
import { Thumb } from "./ui";
import QuickMark from "./cast/QuickMark";
import { useLib } from "./cast/LibState";
import RelatedButton from "./cast/RelatedButton";
import { typeLabel } from "@/lib/img";
import { PRIORITY_LABEL, STATUS_LABEL, type LibItem } from "@/lib/types";

/** The status label as a fixed-width column. Tap it to flip To watch <-> Must watch or Watching <-> Partly watched. */
function StatusPill({ it }: { it: LibItem }) {
  const { get, mark } = useLib();
  const m = get(it.key);
  if (!m) return <span className="pill-slot" />;
  const must = m.status === "watchlist" && m.priority === "must";
  const label = must ? PRIORITY_LABEL.must : STATUS_LABEL[m.status];
  const cls = `pill ${must ? "must" : m.status}`;
  const flip = m.status === "watchlist" ? { text: must ? "Make some day" : "Make must-watch", run: () => mark(it, "watchlist", must ? "someday" : "must") }
    : m.status === "watching" ? { text: "Make partly watched", run: () => mark(it, "partial") }
    : m.status === "partial" ? { text: "Make watching", run: () => mark(it, "watching") } : null;
  return (
    <span className="pill-slot">
      {flip ? <button type="button" className={`${cls} pill-flip`} onClick={flip.run} title={flip.text} aria-label={`${label}. ${flip.text}`}>{label}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5-5 5 5M7 14l5 5 5-5" /></svg></button>
        : <span className={cls}>{label}</span>}
    </span>
  );
}

export default function LibraryList({ items }: { items: LibItem[] }) {
  const [q, setQ] = useState("");
  const list = items.filter((l) => !q.trim() || l.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      {items.length > 5 && <div className="field" style={{ marginTop: 12 }}><input type="search" aria-label="Filter library" placeholder="Filter your library" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
      {list.length === 0 ? <p className="muted" style={{ marginTop: 20 }}>Nothing matches.</p> : (
        <div className="card" style={{ marginTop: 14 }}><ul className="rows">
          {list.map((l) => (
            <li key={l.key} className="row lib-row"><TitleLink className="row-link" k={l.key} it={l}>
              <Thumb path={l.poster} />
              <span className="row-main">
                <span className="row-title">{l.title}</span>
                <span className="row-sub">{l.year} · {typeLabel(l.type)}{l.progress ? ` · S${l.progress.s} E${l.progress.e}` : ""}</span>
                {l.rating > 0 && <span className="stars" aria-label={`${l.rating} of 5`}>{"★".repeat(l.rating) + "☆".repeat(5 - l.rating)}</span>}
              </span>
            </TitleLink><StatusPill it={l} /><QuickMark it={l} variant="inline" /><GlimpseButton spec={titleSpec(l)} /><RelatedButton it={l} /></li>
          ))}
        </ul></div>
      )}
    </>
  );
}
