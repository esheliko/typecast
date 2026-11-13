"use client";
import { TitleLink } from "./Modal";
import { GlimpseButton } from "./Glimpse";
import { titleSpec } from "@/lib/glimpse";
import { useState } from "react";
import { Thumb } from "./ui";
import QuickMark from "./cast/QuickMark";
import { useLib } from "./cast/LibState";
import NewEpPill from "./NewEp";
import RowBadge from "./RowBadge";
import RelatedButton from "./cast/RelatedButton";
import { typeLabel } from "@/lib/img";
import { rowNext } from "@/lib/place-strip";
import { clearProgress, setProgress } from "@/app/actions";
import { getJson } from "@/lib/who-client";
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
 * Library "Watched ✓" on a Watching series: marks the episode after the saved place, using only what the row has (no TMDB call per row). At the tap it asks for the
 * size of the place's season once (cached) so a season's last episode rolls into the next season; if that fails it simply takes the next number. One write, no refresh.
 */
function RowWatched({ it }: { it: LibItem }) {
  const lib = useLib();
  const m = lib.get(it.key);
  const [busy, setBusy] = useState(false);
  if (it.type !== "tv" || m?.status !== "watching") return null;
  const prog = m.progress === undefined ? it.progress : m.progress;
  const guess = rowNext(prog);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    const size = prog ? await getJson<{ episodes: unknown[] }>(`/api/who/season?tv=${it.id}&s=${prog.s}`).then((r) => r.episodes.length).catch(() => null) : null;
    const to = rowNext(prog, size);
    try {
      await setProgress(it.type, it.id, to.s, to.e);
      lib.touch(); lib.setPlace(it.key, to);
      lib.notify(`S${to.s} E${to.e} marked watched`, () => {
        (prog ? setProgress(it.type, it.id, prog.s, prog.e) : clearProgress(it.type, it.id)).then(() => { lib.touch(); lib.setPlace(it.key, prog ?? null); }).catch(() => {});
      });
    } catch { lib.notify("Couldn’t save that. Try again."); }
    setBusy(false);
  };
  return <button type="button" className="ps-row-btn" disabled={busy} onClick={go} aria-label={`Mark S${guess.s} E${guess.e} watched`} title={`Mark S${guess.s} E${guess.e} watched`}>Watched ✓</button>;
}

export default function LibraryList({ items }: { items: LibItem[] }) {
  const [q, setQ] = useState("");
  const list = items.filter((l) => !q.trim() || l.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      {items.length > 5 && <div className="field" style={{ marginTop: 12 }}><input type="search" aria-label="Filter library" placeholder="Filter your library" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
      {list.length === 0 ? <p className="muted" style={{ marginTop: 20 }}>{q.trim() ? <>Nothing in this list matches “{q.trim()}”. <button type="button" className="linkish" onClick={() => setQ("")}>Clear the filter</button></> : "Nothing in this list yet."}</p> : (
        <div className="card" style={{ marginTop: 14 }}><ul className="rows">
          {list.map((l) => (
            <li key={l.key} className="row lib-row"><TitleLink className="row-link" k={l.key} it={l}>
              <Thumb path={l.poster} />
              <span className="row-main">
                <span className="row-title">{l.title}</span>
                <span className="row-sub">{l.year} · {typeLabel(l.type)}{l.progress ? ` · S${l.progress.s} E${l.progress.e}` : ""}</span>
                <NewEpPill k={l.key} />
                <RowBadge k={l.key} />
                {l.rating > 0 && <span className="stars" role="img" aria-label={`Rated ${l.rating} of 5`}>{"★".repeat(l.rating) + "☆".repeat(5 - l.rating)}</span>}
              </span>
            </TitleLink><StatusPill it={l} /><RowWatched it={l} /><QuickMark it={l} variant="inline" /><GlimpseButton spec={titleSpec(l)} /><RelatedButton it={l} /></li>
          ))}
        </ul></div>
      )}
    </>
  );
}
