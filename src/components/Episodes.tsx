"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { setWatchedUpTo } from "@/app/actions";
import { CreditRow } from "./CreditRow";
import { aired, airsLabel, epCode, fmtDate, nextAfter, plural, prevEpisode, untilLabel, upTo } from "@/lib/episodes";
import { useLib } from "./cast/LibState";
import { SpoilerGate } from "./SpoilerGate";
import type { HiddenLine } from "@/lib/spoiler-line";
import { img } from "@/lib/img";
import type { EnrichedMember, Episode, EpisodeLite, Status } from "@/lib/types";

interface Season { name: string; air: string; episodes: (Episode & { hidden?: true })[]; /** The series is Watching in the library and later episodes were held back (docs/features/spoilers.md). */ hidden?: HiddenLine }
interface EpCast { guests: EnrichedMember[]; cast: EnrichedMember[] }

const seasonCache = new Map<string, Promise<Season>>();
/** `lk` is where the saved place was when this was asked (the server decides from the library; it only keeps an answer for one place apart from the next), `reveal` the gate's Show. */
function loadSeason(tv: number, s: number, lk: string, reveal: boolean): Promise<Season> {
  const k = `${tv}:${s}:${lk}${reveal ? ":!" : ""}`;
  let p = seasonCache.get(k);
  if (!p) {
    p = fetch(`/api/season?tv=${tv}&s=${s}${reveal ? "&reveal=1" : ""}`).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not load this season."); return r.json(); });
    p.catch(() => seasonCache.delete(k));
    seasonCache.set(k, p);
  }
  return p;
}
/** The place the server's line is built from, as a cache key: "n" when the series is not Watching, "s" with no place. */
const placeKey = (p: { s: number; e: number } | null, st: Status | null) => (st !== "watching" ? "n" : p ? `${p.s}.${p.e}` : "s");

type P = { s: number; e: number } | null;
const light = (c: EnrichedMember | Episode["guests"][number]): EnrichedMember => ({ hits: [], also: [], top: [], ...c });

/** The season to open on: where you are up to (or the next season once that one is done), else the first. */
function startSeason(seasons: { n: number; eps: number }[], p: P): number {
  if (!p) return seasons[0]?.n ?? 1;
  const cur = seasons.find((x) => x.n === p.s);
  if (cur && p.e >= cur.eps) return seasons.find((x) => x.n > p.s)?.n ?? p.s;
  return cur ? p.s : seasons[0]?.n ?? 1;
}

/**
 * Every season and episode of a series: names, air dates, runtimes, ratings, and per episode its plot, director, writers and
 * guest stars (with where you know them from). Your progress is a checklist: tap an episode's tick to mark it and everything
 * before it watched (adding the series as Watching if needed), tap your last ticked one to step back, Undo reverts the last
 * change. Finishing an ended series offers to mark it Watched. Other parts of the page (cast rows, the next-episode line)
 * open an episode here via a "tc:episode" event.
 */
export default function Episodes({ item, seasons, progress, status, today, ended, latest, next: upcoming }: {
  item: { id: number; title: string; year: string; poster: string | null };
  seasons: { n: number; eps: number }[]; progress: P; status: Status | null; today: string;
  /** Whether the series has ended, its newest aired episode and the next scheduled one (for "finished" / "caught up"). */
  ended: boolean; latest: EpisodeLite | null; next: EpisodeLite | null;
}) {
  const lib = useLib();
  const [p, setP] = useState<P>(progress);
  const [st, setSt] = useState(status);
  const [s, setS] = useState(() => startSeason(seasons, progress));
  const [data, setData] = useState<Season | null>(null);
  // Where the SAVED place is (updated once a save has landed, not while it is in flight): the key the season answers are cached under.
  const [lk, setLk] = useState(() => placeKey(progress, status));
  // Seasons whose gate was opened with Show: this view only, nothing is saved.
  const [shown, setShown] = useState<ReadonlySet<number>>(new Set());
  const lastSeason = useRef("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [undo, setUndo] = useState<{ to: P } | null>(null);
  const [fail, setFail] = useState("");
  const root = useRef<HTMLElement>(null);
  const want = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    // A new season clears the list; a new saved place or a Show keeps the old list on screen until the new answer arrives.
    const here = `${item.id}:${s}`;
    if (lastSeason.current !== here) { lastSeason.current = here; setData(null); }
    setErr("");
    loadSeason(item.id, s, lk, shown.has(s)).then((d) => { if (live) setData(d); }, (e: Error) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [item.id, s, lk, shown]);

  // Once the asked-for episode is on screen, open it and bring it into view.
  useEffect(() => {
    if (!data || want.current === null) return;
    const e = want.current; want.current = null;
    setOpen(e);
    requestAnimationFrame(() => root.current?.querySelector(`[data-ep="${e}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [data]);

  const jump = useCallback((ss: number, e: number) => {
    want.current = e;
    if (ss === s && data) { setOpen(e); want.current = null; requestAnimationFrame(() => root.current?.querySelector(`[data-ep="${e}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })); }
    else setS(ss);
  }, [s, data]);
  useEffect(() => {
    const on = (ev: Event) => { const d = (ev as CustomEvent<{ s: number; e: number }>).detail; if (d) jump(d.s, d.e); };
    window.addEventListener("tc:episode", on);
    return () => window.removeEventListener("tc:episode", on);
  }, [jump]);

  /** Moves your progress to `to` (null clears it), on screen at once; puts it back if the save fails. */
  async function moveTo(to: P, offerUndo = true) {
    const before = p, beforeSt = st;
    setSaving(true); setFail(""); setP(to);
    try {
      const now = await setWatchedUpTo(item, to?.s ?? 1, to?.e ?? 0);
      setSt(now);
      setLk(placeKey(to, now));
      setUndo(offerUndo ? { to: before } : null);
      lib.touch();
    } catch { setP(before); setSt(beforeSt); setFail("Could not save. Check your connection and try again."); }
    setSaving(false);
  }
  const markUpTo = (x: { s: number; e: number }) => moveTo({ s: x.s, e: x.e });
  /** The tick on a watched episode: you stopped just before it. */
  const untick = (x: { s: number; e: number }) => moveTo(prevEpisode(x, seasons));

  const finished = ended && !!latest && upTo(latest, p);
  const caughtUp = !!p && !!latest && !ended && upTo(latest, p);
  const markSeries = () => lib.mark({ key: `tv:${item.id}`, type: "tv", id: item.id, title: item.title, year: item.year, poster: item.poster }, "watched");
  const seriesWatched = (lib.get(`tv:${item.id}`)?.status ?? st) === "watched";

  const eps = data?.episodes ?? [];
  // "Up next" is the episode right after your progress: the next one in its season, or the first of the next season once that one is done.
  const done = p ? p.e >= (seasons.find((x) => x.n === p.s)?.eps ?? Infinity) : false;
  const nextSeason = p ? seasons.find((x) => x.n > p.s)?.n : undefined;
  const next = !p || !eps.length ? null : s === p.s ? nextAfter(eps, p) : done && s === nextSeason ? eps[0] : null;
  const seasonInfo = seasons.find((x) => x.n === s);
  const airedCount = eps.filter((x) => aired(x, today)).length;
  const lastAiredHere = [...eps].reverse().find((x) => aired(x, today)) ?? null;
  const list = seasons;

  return (
    <section ref={root} className="eps" aria-label="Episodes">
      <h2>Episodes</h2>
      {list.length > 1 && (
        <div className="ep-seasons" role="group" aria-label="Season">
          {list.map((x) => (
            <button key={x.n} type="button" className="chip" aria-pressed={x.n === s} onClick={() => { setOpen(null); setS(x.n); }}>
              {x.n === 0 ? "Specials" : `S${x.n}`}{p && p.s > x.n && x.n > 0 ? " ✓" : ""}
            </button>
          ))}
        </div>
      )}
      <div className="card">
        <div className="ep-shead">
          <span className="row-title" style={{ fontSize: 17 }}>{data?.name ?? (s === 0 ? "Specials" : `Season ${s}`)}</span>
          <span className="small muted">
            {[seasonInfo?.eps ? plural(seasonInfo.eps, "episode") : "", data?.air ? fmtDate(data.air).slice(-4) : "", data && airedCount < eps.length ? `${airedCount} aired so far` : ""].filter(Boolean).join(" · ")}
          </span>
          {lastAiredHere && !upTo(lastAiredHere, p) && (
            <button type="button" className="btn sm" disabled={saving} onClick={() => markUpTo(lastAiredHere)}>{airedCount < eps.length ? "Tick all aired" : "Tick whole season"}</button>
          )}
        </div>
        {(undo || fail) && (
          <div className="ep-note small" role="status">
            {fail ? <span className="err">{fail}</span> : <>{p ? `Up to ${epCode(p.s, p.e)}` : "No episodes ticked"} <button type="button" className="linkish" disabled={saving} onClick={() => moveTo(undo!.to, false)}>Undo</button></>}
          </div>
        )}
        {finished && !seriesWatched && (
          <div className="ep-note small">That was the last episode. <button type="button" className="btn sm gold" onClick={markSeries}>Mark {item.title} Watched</button></div>
        )}
        {caughtUp && (
          <div className="ep-note small">You are caught up.{upcoming?.air && airsLabel(upcoming.air, today) ? ` New episode ${airsLabel(upcoming.air, today)} (${epCode(upcoming.s, upcoming.e)}).` : ""}</div>
        )}
        {err && <p className="err small" style={{ padding: "0 14px 12px" }}>{err}</p>}
        {!data && !err && <p className="muted small" style={{ padding: "0 14px 12px" }}><span className="spin" />Loading episodes</p>}
        {data && eps.length === 0 && <p className="muted small" style={{ padding: "0 14px 12px" }}>No episodes listed yet.</p>}
        {data?.hidden && (
          <div style={{ padding: "0 14px" }}><SpoilerGate title={item.title} hidden={data.hidden} what="episode names and plots" hintKey={`tv:${item.id}`} placeHref={`/watching?k=tv-${item.id}`}
            onShow={() => setShown((v) => new Set(v).add(s))} /></div>
        )}
        <ul className="ep-list">
          {eps.map((x) => {
            const isOpen = open === x.e, seen = upTo(x, p), out = aired(x, today), isNext = next?.s === x.s && next?.e === x.e;
            const sub = [out ? fmtDate(x.air, true) : x.air ? `${fmtDate(x.air, true)} · ${untilLabel(x.air, today)}` : "No date yet", x.runtime ? `${x.runtime} min` : "", x.votes >= 5 ? `★ ${x.rating.toFixed(1)}` : ""].filter(Boolean).join(" · ");
            return (
              <li key={x.e} data-ep={x.e} className={`ep${seen ? " ep-seen" : ""}${out ? "" : " ep-soon"}${isOpen ? " ep-open" : ""}`}>
                <button type="button" className="ep-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : x.e)}>
                  <span className="ep-n">{x.e}</span>
                  <span className="ep-main">
                    <span className="ep-name">{x.name || `Episode ${x.e}`}</span>
                    <span className="ep-sub">{sub}</span>
                  </span>
                  {isNext && <span className="pill watching">Up next</span>}
                  {!isNext && x.finale && <span className="pill">Finale</span>}
                </button>
                {out && (
                  <button type="button" className="ep-tick" aria-pressed={seen} disabled={saving}
                    aria-label={seen ? `Watched ${epCode(x.s, x.e)}. Tap to untick` : `Mark watched up to ${epCode(x.s, x.e)}`}
                    title={seen ? "Watched (tap if you stopped before this one)" : "Watched up to here"}
                    onClick={() => (seen ? untick(x) : markUpTo(x))}>✓</button>
                )}
                {isOpen && x.hidden && <div className="ep-panel"><p className="small muted" style={{ margin: 0 }}>The plot, crew and guest stars of {epCode(x.s, x.e)} are hidden. Use Show above to see this season.</p></div>}
                {isOpen && !x.hidden && <EpisodePanel tv={item.id} x={x} mine={!!p && p.s === x.s && p.e === x.e} canMark={out} saving={saving} onMark={() => markUpTo(x)} status={st} />}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

const castCache = new Map<string, Promise<EpCast>>();
function loadCast(tv: number, s: number, e: number): Promise<EpCast> {
  const k = `${tv}:${s}:${e}`;
  let p = castCache.get(k);
  if (!p) {
    p = fetch(`/api/episode?tv=${tv}&s=${s}&e=${e}`).then(async (r) => { if (!r.ok) throw new Error("lookup failed"); return r.json(); });
    p.catch(() => castCache.delete(k));
    castCache.set(k, p);
  }
  return p;
}

/** One opened episode: still, plot, director and writers, guest stars (where you know them from fills in), and the progress button. */
function EpisodePanel({ tv, x, mine, canMark, saving, onMark, status }: { tv: number; x: Episode; mine: boolean; canMark: boolean; saving: boolean; onMark: () => void; status: Status | null }) {
  const [cast, setCast] = useState<EpCast | null>(null);
  useEffect(() => {
    let live = true;
    loadCast(tv, x.s, x.e).then((c) => { if (live) setCast(c); }, () => { /* keep the plain guest list */ });
    return () => { live = false; };
  }, [tv, x.s, x.e]);
  const byId = new Map((cast?.guests ?? []).map((g) => [g.id, g]));
  const guests = x.guests.length ? x.guests.map((g) => ({ ...light(g), ...byId.get(g.id), credits: g.credits })) : (cast?.guests ?? []);
  const regulars = cast?.cast.filter((c) => !guests.some((g) => g.id === c.id)) ?? [];
  const crew = [x.directors.length ? `Directed by ${x.directors.join(", ")}` : "", x.writers.length ? `Written by ${x.writers.join(", ")}` : ""].filter(Boolean);
  const show = { id: tv, episodes: 0 };
  return (
    <div className="ep-panel">
      <div className="ep-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {x.still && <img className="ep-still" src={img(x.still, "w300")} alt="" loading="lazy" decoding="async" />}
        <div style={{ minWidth: 0 }}>
          <div className="mono small muted">{epCode(x.s, x.e)}{x.air ? ` · ${fmtDate(x.air, true)}` : ""}</div>
          {crew.map((c) => <div key={c} className="small">{c}</div>)}
          {x.overview && <p className="small" style={{ margin: "8px 0 0" }}>{x.overview}</p>}
          {canMark && (mine
            ? <div className="small" style={{ marginTop: 8, color: "var(--good)" }}>✓ You are up to here</div>
            : <button type="button" className="btn sm gold" style={{ marginTop: 8 }} disabled={saving} onClick={onMark}>{saving ? "Saving…" : status ? "Watched up to here" : "Watching: up to here"}</button>)}
        </div>
      </div>
      {guests.length > 0 && (
        <>
          <div className="apps-head" style={{ marginTop: 12 }}>Guest stars</div>
          <ul className="credits">{guests.map((g) => <CreditRow key={g.id} c={g} pending={!cast} tv={show} />)}</ul>
        </>
      )}
      {regulars.length > 0 && (
        <details className="cw" style={{ marginTop: 10 }}>
          <summary>Regulars in this episode<span className="cw-n">{regulars.length}</span></summary>
          <ul className="credits">{regulars.map((g) => <CreditRow key={g.id} c={g} />)}</ul>
        </details>
      )}
      {guests.length === 0 && cast && regulars.length === 0 && <p className="muted small" style={{ marginTop: 10 }}>No cast listed for this episode.</p>}
    </div>
  );
}
