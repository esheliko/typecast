"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import TagPicker from "./TagPicker";
import { DECADES, RATINGS, toParams, type BrowseQuery, type Tag } from "@/lib/browse";

/** Detailed filter panel for the Browse view. The URL is the source of truth, so every view is shareable and Back works. Films / Series is chosen in the Browse bar. */
export default function BrowseFilters({ q, genres, canFilterMine, active }: { q: BrowseQuery; genres: Tag[]; canFilterMine: boolean; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState(q.from);
  const [to, setTo] = useState(q.to);
  useEffect(() => { setFrom(q.from); setTo(q.to); }, [q.from, q.to]);

  const go = (next: Partial<BrowseQuery>) => {
    const s = toParams({ ...q, ...next }).toString();
    start(() => router.replace(s ? `/?${s}` : "/", { scroll: false }));
  };

  // Years commit once they are a full 4 digits (or cleared).
  useEffect(() => {
    const ok = (v: string) => v === "" || /^\d{4}$/.test(v);
    if (!ok(from) || !ok(to) || (from === q.from && to === q.to)) return;
    const t = setTimeout(() => go(from && to && from > to ? { from: to, to: from } : { from, to }), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const toggleGenre = (id: number) => go({ genres: q.genres.includes(id) ? q.genres.filter((g) => g !== id) : [...q.genres, id] });
  const decade = (d: (typeof DECADES)[number]) => go({ from: d.from, to: d.to });
  const decadeOn = (d: (typeof DECADES)[number]) => q.from === d.from && q.to === d.to;

  return (
    <section className="card pad filters" aria-busy={pending} aria-label="Browse filters">
      {pending && <span className="small muted"><span className="spin" />Updating</span>}
      <div className="frow" role="group" aria-label="Genre">
        {genres.map((g) => <button key={g.id} type="button" className="chip" aria-pressed={q.genres.includes(g.id)} onClick={() => toggleGenre(g.id)}>{g.name}</button>)}
      </div>

      <div className="frow" role="group" aria-label="Year and rating">
        {DECADES.map((d) => <button key={d.label} type="button" className="chip" aria-pressed={decadeOn(d)} onClick={() => decadeOn(d) ? go({ from: "", to: "" }) : decade(d)}>{d.label}</button>)}
        <span className="years">
          <input inputMode="numeric" maxLength={4} placeholder="From" aria-label="From year" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ""))} />
          <span className="muted">–</span>
          <input inputMode="numeric" maxLength={4} placeholder="To" aria-label="To year" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ""))} />
        </span>
        <span className="fsep" aria-hidden="true" />
        {RATINGS.filter((r) => r).map((r) => <button key={r} type="button" className="chip" aria-pressed={q.minRating === r} aria-label={`Rating ${r} or higher`} onClick={() => go({ minRating: q.minRating === r ? 0 : r })}>★ {r}+</button>)}
      </div>

      <div className="two">
        <TagPicker kind="person" label="Cast or crew" placeholder="Search a person" value={q.people} onChange={(people) => go({ people })} />
        <TagPicker kind="company" label="Studio" placeholder="Pixar, A24…" value={q.companies} onChange={(companies) => go({ companies })} />
      </div>
      <TagPicker kind="keyword" label="Theme or keyword" placeholder="heist, time travel, based on novel…" value={q.keywords} onChange={(keywords) => go({ keywords })} />
      <p className="small muted" style={{ margin: "6px 0 0" }}>With several people, titles must feature all of them. Studios and themes match any.</p>

      <div className="chips" style={{ marginTop: 14 }}>
        {canFilterMine && <button type="button" className="chip" aria-pressed={q.mine} onClick={() => go({ mine: !q.mine })}>On my streaming services</button>}
        {active && <button type="button" className="chip" onClick={() => start(() => router.replace(q.type === "all" ? "/" : `/?type=${q.type}`, { scroll: false }))}>Clear all</button>}
      </div>
    </section>
  );
}
