"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import TagPicker from "./TagPicker";
import { DECADES, RATINGS, SORTS, toParams, type BrowseQuery, type Sort, type Tag } from "@/lib/browse";
import type { MediaType } from "@/lib/types";

/** Filter panel. The URL is the source of truth, so every view is shareable and Back works. */
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
  // Genre ids differ between films and series, so they reset when switching.
  const setType = (type: MediaType) => type !== q.type && go({ type, genres: [] });

  return (
    <section className="card pad filters" aria-busy={pending} aria-label="Browse filters">
      <div className="chips" role="group" aria-label="Type">
        {(["movie", "tv"] as const).map((t) => (
          <button key={t} type="button" className="chip" aria-pressed={q.type === t} onClick={() => setType(t)}>{t === "movie" ? "Films" : "Series"}</button>
        ))}
        {pending && <span className="small muted" style={{ alignSelf: "center" }}><span className="spin" />Updating</span>}
      </div>

      <label className="l">Genre</label>
      <div className="chips" role="group" aria-label="Genre">
        {genres.map((g) => <button key={g.id} type="button" className="chip" aria-pressed={q.genres.includes(g.id)} onClick={() => toggleGenre(g.id)}>{g.name}</button>)}
      </div>

      <label className="l">Year</label>
      <div className="chips" role="group" aria-label="Decade">
        {DECADES.map((d) => <button key={d.label} type="button" className="chip" aria-pressed={decadeOn(d)} onClick={() => decadeOn(d) ? go({ from: "", to: "" }) : decade(d)}>{d.label}</button>)}
      </div>
      <div className="inline years">
        <input inputMode="numeric" maxLength={4} placeholder="From" aria-label="From year" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ""))} />
        <span className="muted">to</span>
        <input inputMode="numeric" maxLength={4} placeholder="To" aria-label="To year" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ""))} />
      </div>

      <TagPicker kind="person" label="Actor or director" placeholder="Search a person" value={q.people} onChange={(people) => go({ people })} />
      <TagPicker kind="company" label="Studio or company" placeholder="Pixar, A24, Marvel Studios…" value={q.companies} onChange={(companies) => go({ companies })} />
      <TagPicker kind="keyword" label="Theme or keyword" placeholder="heist, time travel, based on novel…" value={q.keywords} onChange={(keywords) => go({ keywords })} />
      <p className="small muted" style={{ margin: "6px 0 0" }}>With several people, titles must feature all of them. Studios and themes match any.</p>

      <div className="two">
        <div>
          <label className="l" htmlFor="b-sort">Sort by</label>
          <select id="b-sort" value={q.sort} onChange={(e) => go({ sort: e.target.value as Sort })}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="l" htmlFor="b-rate">Rating</label>
          <select id="b-rate" value={q.minRating} onChange={(e) => go({ minRating: Number(e.target.value) })}>
            {RATINGS.map((r) => <option key={r} value={r}>{r ? `${r}+ out of 10` : "Any"}</option>)}
          </select>
        </div>
      </div>

      <div className="chips" style={{ marginTop: 14 }}>
        {canFilterMine && <button type="button" className="chip" aria-pressed={q.mine} onClick={() => go({ mine: !q.mine })}>On my streaming services</button>}
        {active && <button type="button" className="chip" onClick={() => start(() => router.replace("/", { scroll: false }))}>Clear all</button>}
      </div>
    </section>
  );
}
