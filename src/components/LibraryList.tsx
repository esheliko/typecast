"use client";
import { TitleLink } from "./Modal";
import { ImdbRate } from "./ImdbRate";
import { GlimpseButton } from "./Glimpse";
import { titleSpec } from "@/lib/glimpse";
import { useEffect, useState } from "react";
import { Thumb } from "./ui";
import QuickMark from "./cast/QuickMark";
import { useLib } from "./cast/LibState";
import NewEpPill from "./NewEp";
import RowBadge from "./RowBadge";
import RelatedButton from "./cast/RelatedButton";
import { ResumeButton } from "./ResumeSheet";
import { stoppedLabel, stoppedPct } from "@/lib/film-resume";
import { typeLabel } from "@/lib/img";
import { setRating } from "@/app/actions";
import { PRIORITY_LABEL, STATUS_LABEL, markLabel, type LibItem } from "@/lib/types";

/** The status label as a fixed-width column. Tap it to flip To watch <-> Must watch or Watching <-> Partly watched. */
function StatusPill({ it }: { it: LibItem }) {
  const { get, mark } = useLib();
  const m = get(it.key);
  if (!m) return <span className="pill-slot" />;
  const must = m.status === "watchlist" && m.priority === "must";
  const label = markLabel(m.status, m.priority);
  const cls = `pill ${must ? "must" : m.status}`;
  const flip = m.status === "watchlist" ? { text: `Make ${PRIORITY_LABEL[must ? "someday" : "must"]}`, run: () => mark(it, "watchlist", must ? "someday" : "must") }
    : m.status === "watching" ? { text: `Make ${STATUS_LABEL.partial}`, run: () => mark(it, "partial") }
    : m.status === "partial" ? { text: `Make ${STATUS_LABEL.watching}`, run: () => mark(it, "watching") } : null;
  return (
    <span className="pill-slot">
      {flip ? <button type="button" className={`${cls} pill-flip`} onClick={flip.run} title={flip.text} aria-label={`${label}. ${flip.text}`}>{label}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5-5 5 5M7 14l5 5 5-5" /></svg></button>
        : <span className={cls}>{label}</span>}
    </span>
  );
}

/**
 * The saved place of a Watching / Partly watched series as a small chip ("S4 E16"). It opens the title popup with that episode open and in view, so the next
 * place can be picked there. Replaces the old "Watched ✓" button; it is a link, so it makes no write and no TMDB call.
 */
function RowEpisode({ it }: { it: LibItem }) {
  const { get } = useLib();
  const m = get(it.key);
  if (it.type !== "tv" || (m?.status !== "watching" && m?.status !== "partial")) return null;
  const prog = m.progress === undefined ? it.progress : m.progress;
  if (!prog) return null;
  return <TitleLink className="pill ep-chip" k={it.key} it={it} ep={prog} title="Open this episode" aria-label={`Season ${prog.s} episode ${prog.e}. Open the episode list`}>S{prog.s} E{prog.e}</TitleLink>;
}

/**
 * Stars on the Library row: rate without opening the title. One write (`setRating`), no refresh; tapping the lit star clears it (same as the popup).
 * The row shows the saved rating until a tap, then the tap at once; a failed save puts the old rating back.
 */
function RowRating({ it }: { it: LibItem }) {
  const lib = useLib();
  const m = lib.get(it.key);
  const [over, setOver] = useState<number | null>(null);
  useEffect(() => { setOver(null); }, [it.rating, m === null]);
  if (!m) return null;
  const stars = over ?? it.rating;
  const rate = async (n: number) => {
    const next = stars === n ? 0 : n;
    const before = stars;
    setOver(next);
    try { await setRating(it.type, it.id, next); lib.touch(); if (next > 0) lib.markRich(it.key); }
    catch { setOver(before); lib.notify("Couldn’t save that rating. Try again."); }
  };
  return (
    <span className="stars row-rate" role="group" aria-label={`Your rating for ${it.title}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => rate(n)} aria-pressed={n === stars} aria-label={n === 1 ? "1 star" : `${n} stars`}>{n <= stars ? "★" : "☆"}</button>
      ))}
    </span>
  );
}

export default function LibraryList({ items }: { items: LibItem[] }) {
  const [q, setQ] = useState("");
  const { get } = useLib();
  const list = items.filter((l) => !q.trim() || l.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      {items.length > 5 && <div className="field" style={{ marginTop: 12 }}><input type="search" aria-label="Filter library" placeholder="Filter your library" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
      {list.length === 0 ? <p className="muted" style={{ marginTop: 20 }}>{q.trim() ? <>Nothing in this list matches “{q.trim()}”. <button type="button" className="linkish" onClick={() => setQ("")}>Clear the filter</button></> : "Nothing in this list yet."}</p> : (
        <div className="card" style={{ marginTop: 14 }}><ul className="rows">
          {list.map((l) => {
            // A Watching film with a stopped time (docs/features/film-resume.md): the sub line says where, with a thin bar and a Resume button. Films without one look as before.
            const st = l.type === "movie" ? (() => { const m = get(l.key); return m?.status === "watching" ? m.stopped : undefined; })() : undefined;
            const of = l.stoppedOf ?? null;
            return (
            <li key={l.key} className="row lib-row"><TitleLink className="row-link" k={l.key} it={l}>
              <Thumb path={l.poster} />
              <span className="row-main">
                <span className="row-title">{l.title}</span>
                <span className="row-sub">{l.year} · {typeLabel(l.type)}<ImdbRate k={l.key} lead=" · " />{st ? ` · ${stoppedLabel(st, of)}` : ""}</span>
                {st && of ? <span className="rs-bar-line" role="img" aria-label={`${stoppedPct(st, of)} percent watched`}><i style={{ width: `${stoppedPct(st, of)}%` }} /></span> : null}
                <NewEpPill k={l.key} />
                <RowBadge k={l.key} />
              </span>
            </TitleLink><RowRating it={l} /><RowEpisode it={l} /><StatusPill it={l} /><QuickMark it={l} variant="inline" /><GlimpseButton spec={titleSpec(l)} /><RelatedButton it={l} />{st ? <span className="rs-act-row"><ResumeButton it={l} stopped={st} runtime={of} className="btn sm gold" /></span> : null}</li>
            );
          })}
        </ul></div>
      )}
    </>
  );
}
