"use client";
import { useEffect, useState } from "react";
import { setRating, setStatus } from "@/app/actions";
import { img } from "@/lib/img";
import type { Applied, Unmatched } from "@/lib/letterboxd";
import type { BrowseItem, SearchHit, Status } from "@/lib/types";

export type ReviewRow = { id: string; label: string; item: BrowseItem | null; status: Status; rating: number; isNew: boolean; gone?: boolean; err?: string };

let n = 0;
export const toRows = (items: Applied[], missing: Unmatched[]): ReviewRow[] => [
  ...missing.map((m): ReviewRow => ({ id: `r${n++}`, label: m.label, item: null, status: m.status, rating: m.rating, isNew: true })),
  ...items.map((a): ReviewRow => ({ id: `r${n++}`, label: a.label, item: { key: `${a.type}:${a.id}`, type: a.type, id: a.id, title: a.title, year: a.year, poster: a.poster, rating: 0 }, status: a.status, rating: a.rating, isNew: a.isNew })),
];

const OPTIONS: [Status, string][] = [["watched", "Watched"], ["watching", "Watching"], ["watchlist", "To watch"]];

/** After an import: every title that was added, with the original text, so a wrong match or a wrong marking can be fixed. */
export default function ImportReview({ rows, onChange }: { rows: ReviewRow[]; onChange: (rows: ReviewRow[]) => void }) {
  const [fixing, setFixing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const patch = (id: string, p: Partial<ReviewRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));

  async function guard(r: ReviewRow, f: () => Promise<void>) {
    setBusy(r.id);
    try { await f(); patch(r.id, { err: undefined }); } catch { patch(r.id, { err: "That did not save. Try again." }); }
    setBusy(null);
  }
  const mark = (r: ReviewRow, status: Status) => guard(r, async () => {
    if (r.item) await setStatus(r.item, status);
    patch(r.id, { status });
  });
  const remove = (r: ReviewRow) => guard(r, async () => { if (r.item) await setStatus(r.item, null); patch(r.id, { gone: true }); });
  const swap = (r: ReviewRow, next: BrowseItem) => guard(r, async () => {
    if (r.item && r.isNew) await setStatus(r.item, null);
    await setStatus(next, r.status);
    if (r.status === "watched" && r.rating > 0) await setRating(next.type, next.id, r.rating);
    patch(r.id, { item: next, isNew: true, gone: false });
    setFixing(null);
  });

  const live = rows.filter((r) => !r.gone);
  return (
    <div style={{ marginTop: 14 }}>
      <b>Review what was imported</b>
      <p className="small muted" style={{ margin: "4px 0 10px" }}>Check each title against what you wrote. Change the marking, remove it, or pick the right title. Changes save at once.</p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {live.map((r) => (
          <li key={r.id} className="card pad" style={{ padding: 10 }} aria-busy={busy === r.id}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.item?.poster ? <img className="thumb" src={img(r.item.poster, "w92")} alt="" loading="lazy" /> : <div className="thumb" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{r.item ? `${r.item.title}${r.item.year ? ` (${r.item.year})` : ""}${r.item.type === "tv" ? " · TV" : ""}` : "Not found"}</div>
                <div className="small muted" dir="auto">You wrote: {r.label}</div>
                {!r.isNew && <div className="small muted">Already in your library.</div>}
              </div>
            </div>
            <div className="chips" style={{ marginTop: 8, alignItems: "center" }}>
              {r.item ? (
                <select aria-label={`Marking for ${r.label}`} value={r.status} disabled={busy === r.id} onChange={(e) => mark(r, e.target.value as Status)}>
                  {OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  {r.status === "partial" && <option value="partial">Partly watched</option>}
                </select>
              ) : <span className="small muted">Was going to be {OPTIONS.find((o) => o[0] === r.status)?.[1].toLowerCase()}</span>}
              <button className="btn sm" type="button" onClick={() => setFixing(fixing === r.id ? null : r.id)}>{r.item ? "Wrong title?" : "Find it"}</button>
              {r.item && r.isNew && <button className="btn sm" type="button" disabled={busy === r.id} onClick={() => remove(r)}>Remove</button>}
              {!r.item && <button className="btn sm" type="button" onClick={() => patch(r.id, { gone: true })}>Skip</button>}
            </div>
            {fixing === r.id && <Picker start={r.label} onPick={(it) => swap(r, it)} />}
            {r.err && <p className="small err" style={{ margin: "6px 0 0" }}>{r.err}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Picker({ start, onPick }: { start: string; onPick: (it: BrowseItem) => void }) {
  const [q, setQ] = useState(start.replace(/\s*\([^)]*\)\s*$/, ""));
  const [hits, setHits] = useState<BrowseItem[] | null>(null);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?kind=title&q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        const d = (await r.json()) as { hits?: SearchHit[] };
        setHits((d.hits ?? []).filter((h): h is Extract<SearchHit, { kind: "title" }> => h.kind === "title").slice(0, 8));
      } catch { /* aborted or offline */ }
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);
  return (
    <div style={{ marginTop: 8 }}>
      <input type="text" aria-label="Search for the right title" value={q} onChange={(e) => setQ(e.target.value)} dir="auto" style={{ width: "100%" }} autoFocus />
      {hits && <ul className="pick-list" style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
        {hits.length === 0 && <li className="small muted" style={{ padding: 8 }}>No results.</li>}
        {hits.map((h) => (
          <li key={h.key}>
            <button type="button" onClick={() => onPick(h)} style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", textAlign: "start", background: "none", border: 0, padding: 4, cursor: "pointer" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {h.poster ? <img className="thumb" src={img(h.poster, "w92")} alt="" loading="lazy" /> : <div className="thumb" />}
              <span>{h.title}{h.year ? ` (${h.year})` : ""}<span className="small muted">{h.type === "tv" ? " · TV" : " · Film"}</span></span>
            </button>
          </li>
        ))}
      </ul>}
    </div>
  );
}
