"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setWatchedUpTo } from "@/app/actions";
import { CreditRow } from "./CreditRow";
import { aired, epCode, fmtDate, nextAfter, plural, untilLabel, upTo } from "@/lib/episodes";
import { img } from "@/lib/img";
import type { EnrichedMember, Episode, Status } from "@/lib/types";

interface Season { name: string; air: string; episodes: Episode[] }
interface EpCast { guests: EnrichedMember[]; cast: EnrichedMember[] }

const seasonCache = new Map<string, Promise<Season>>();
function loadSeason(tv: number, s: number): Promise<Season> {
  const k = `${tv}:${s}`;
  let p = seasonCache.get(k);
  if (!p) {
    p = fetch(`/api/season?tv=${tv}&s=${s}`).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not load this season."); return r.json(); });
    p.catch(() => seasonCache.delete(k));
    seasonCache.set(k, p);
  }
  return p;
}

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
 * guest stars (with where you know them from). Your progress is marked, and "Watched up to here" moves it (adding the series as
 * Watching if needed). Other parts of the page (cast rows, the next-episode line) open an episode here via a "tc:episode" event.
 */
export default function Episodes({ item, seasons, progress, status, today }: {
  item: { id: number; title: string; year: string; poster: string | null };
  seasons: { n: number; eps: number }[]; progress: P; status: Status | null; today: string;
}) {
  const router = useRouter();
  const [p, setP] = useState<P>(progress);
  const [st, setSt] = useState(status);
  const [s, setS] = useState(() => startSeason(seasons, progress));
  const [data, setData] = useState<Season | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const root = useRef<HTMLElement>(null);
  const want = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    setData(null); setErr("");
    loadSeason(item.id, s).then((d) => { if (live) setData(d); }, (e: Error) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [item.id, s]);

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

  async function markUpTo(x: Episode) {
    const before = p, beforeSt = st;
    setSaving(true); setP({ s: x.s, e: x.e });
    try { setSt(await setWatchedUpTo(item, x.s, x.e)); router.refresh(); }
    catch { setP(before); setSt(beforeSt); }
    setSaving(false);
  }

  const eps = data?.episodes ?? [];
  // "Up next" is the episode right after your progress: the next one in its season, or the first of the next season once that one is done.
  const done = p ? p.e >= (seasons.find((x) => x.n === p.s)?.eps ?? Infinity) : false;
  const nextSeason = p ? seasons.find((x) => x.n > p.s)?.n : undefined;
  const next = !p || !eps.length ? null : s === p.s ? nextAfter(eps, p) : done && s === nextSeason ? eps[0] : null;
  const seasonInfo = seasons.find((x) => x.n === s);
  const airedCount = eps.filter((x) => aired(x, today)).length;
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
        </div>
        {err && <p className="err small" style={{ padding: "0 14px 12px" }}>{err}</p>}
        {!data && !err && <p className="muted small" style={{ padding: "0 14px 12px" }}><span className="spin" />Loading episodes</p>}
        {data && eps.length === 0 && <p className="muted small" style={{ padding: "0 14px 12px" }}>No episodes listed yet.</p>}
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
                  {seen && <span className="ep-check" aria-label="Watched">✓</span>}
                </button>
                {isOpen && <EpisodePanel tv={item.id} x={x} mine={!!p && p.s === x.s && p.e === x.e} canMark={out} saving={saving} onMark={() => markUpTo(x)} status={st} />}
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
