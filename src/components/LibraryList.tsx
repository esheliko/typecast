"use client";
import { TitleLink } from "./Modal";
import { GlimpseButton } from "./Glimpse";
import { titleSpec } from "@/lib/glimpse";
import { useState } from "react";
import { Thumb } from "./ui";
import QuickMark from "./cast/QuickMark";
import RelatedButton from "./cast/RelatedButton";
import { typeLabel } from "@/lib/img";
import { PRIORITY_LABEL, STATUS_LABEL, type LibItem } from "@/lib/types";

export default function LibraryList({ items }: { items: LibItem[] }) {
  const [q, setQ] = useState("");
  const list = items.filter((l) => !q.trim() || l.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      {items.length > 5 && <div className="field" style={{ marginTop: 12 }}><input type="search" aria-label="Filter library" placeholder="Filter your library" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
      {list.length === 0 ? <p className="muted" style={{ marginTop: 20 }}>Nothing matches.</p> : (
        <div className="card" style={{ marginTop: 14 }}><ul className="rows">
          {list.map((l) => (
            <li key={l.key} className="row"><TitleLink className="row-link" k={l.key}>
              <Thumb path={l.poster} />
              <span className="row-main">
                <span className="row-title">{l.title}</span>
                <span className="row-sub">{l.year} · {typeLabel(l.type)}{l.progress ? ` · S${l.progress.s} E${l.progress.e}` : ""}</span>
                {l.rating > 0 && <span className="stars" aria-label={`${l.rating} of 5`}>{"★".repeat(l.rating) + "☆".repeat(5 - l.rating)}</span>}
              </span>
              <span className={`pill ${l.status === "watchlist" && l.priority === "must" ? "must" : l.status}`}>{l.status === "watchlist" && l.priority === "must" ? PRIORITY_LABEL.must : STATUS_LABEL[l.status]}</span>
            </TitleLink><QuickMark it={l} variant="inline" /><GlimpseButton spec={titleSpec(l)} /><RelatedButton it={l} /></li>
          ))}
        </ul></div>
      )}
    </>
  );
}
