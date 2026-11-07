"use client";
import Link from "next/link";
import { useState } from "react";
import { href, img, typeLabel } from "@/lib/img";
import { STATUS_LABEL, type BrowseItem, type Status } from "@/lib/types";

interface Props { initial: BrowseItem[]; page: number; totalPages: number; query: string; lib: Record<string, Status>; notice?: string }

/** Poster grid with a "Show more" button. Remount (via key) when the query changes. */
export default function BrowseResults({ initial, page, totalPages, query, lib, notice }: Props) {
  const [items, setItems] = useState(initial);
  const [cur, setCur] = useState(page);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function more() {
    setState("loading");
    try {
      const u = new URLSearchParams(query); u.set("page", String(cur + 1));
      const r = await fetch(`/api/discover?${u}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not load more.");
      setItems((old) => { const seen = new Set(old.map((i) => i.key)); return [...old, ...(j.items as BrowseItem[]).filter((i) => !seen.has(i.key))]; });
      setCur(cur + 1); setState("idle");
    } catch (e) { setError((e as Error).message); setState("error"); }
  }

  if (!items.length) return <p className="muted" style={{ marginTop: 20 }}>Nothing matches those filters. Try removing one.</p>;
  return (
    <>
      {notice && <p className="small muted" style={{ marginTop: 12 }}>{notice}</p>}
      <div className="grid" aria-live="polite">
        {items.map((t) => (
          <Link key={t.key} className="tile" href={href(t.key)}>
            {t.poster ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(t.poster, "w342")} alt="" loading="lazy" /> : <div className="ph" />}
            <span className="row-title">{t.title}</span>
            <span className="row-sub mono">{t.year || "TBA"} · {typeLabel(t.type)}{t.rating ? ` · ★ ${t.rating}` : ""}</span>
            {lib[t.key] && <span className={`pill ${lib[t.key]}`} style={{ alignSelf: "flex-start", marginTop: 4 }}>{STATUS_LABEL[lib[t.key]]}</span>}
          </Link>
        ))}
      </div>
      {state === "error" && <p className="err small">{error}</p>}
      {cur < totalPages && (
        <p style={{ textAlign: "center", marginTop: 16 }}>
          <button className="btn" type="button" onClick={more} disabled={state === "loading"}>{state === "loading" ? "Loading…" : "Show more"}</button>
        </p>
      )}
    </>
  );
}
