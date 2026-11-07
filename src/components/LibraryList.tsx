"use client";
import Link from "next/link";
import { useState } from "react";
import { Thumb } from "./ui";
import { href, typeLabel } from "@/lib/img";
import { STATUS_LABEL, type LibItem } from "@/lib/types";

export default function LibraryList({ items }: { items: LibItem[] }) {
  const [q, setQ] = useState("");
  const list = items.filter((l) => !q.trim() || l.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      {items.length > 5 && <div className="field" style={{ marginTop: 12 }}><input type="search" aria-label="Filter library" placeholder="Filter your library" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
      {list.length === 0 ? <p className="muted" style={{ marginTop: 20 }}>Nothing matches.</p> : (
        <div className="card" style={{ marginTop: 14 }}><ul className="rows">
          {list.map((l) => (
            <li key={l.key}><Link className="row" href={href(l.key)}>
              <Thumb path={l.poster} />
              <span className="row-main">
                <span className="row-title">{l.title}</span>
                <span className="row-sub">{l.year} · {typeLabel(l.type)}{l.progress ? ` · S${l.progress.s} E${l.progress.e}` : ""}</span>
                {l.rating > 0 && <span className="stars" aria-label={`${l.rating} of 5`}>{"★".repeat(l.rating) + "☆".repeat(5 - l.rating)}</span>}
              </span>
              <span className={`pill ${l.status}`}>{STATUS_LABEL[l.status]}</span>
            </Link></li>
          ))}
        </ul></div>
      )}
    </>
  );
}
