"use client";
import { useEffect, useRef, useState } from "react";
import { useWatchControl } from "../Watching";
import { useLib } from "../cast/LibState";
import { setStopped } from "@/app/actions";
import { stoppedWrite } from "@/lib/film-resume";
import { filmDone, isLastEpisode, seriesEnded } from "@/lib/watch-library";
import { markPromptDone, promptDone } from "@/lib/watch-prev";
import { elapsedMin, setPaused, shiftWatch, whereLabel, type Watch } from "@/lib/watching";
import { img } from "@/lib/img";
import { fmtDay, fmtRange } from "@/lib/who-dates";
import { whoApi } from "@/lib/who-client";
import type { WhoBrief, WhoEp } from "@/lib/who-data";
import type { Item } from "@/lib/types";
import type { Pos } from "@/lib/who-types";

/** "Where are you?": season, episode (first option "Not sure", then the season's episodes with stills, never summaries) and "Not sure of the season". Series only. */
/** `onNext(from, to)`: the Next button. `from` is the episode you were on (null when it was not an exact episode), `to` where it goes (null on the final episode of an ended series: nowhere). */
export function PositionControl({ brief, pos, onChange, onNext }: { brief: WhoBrief; pos: Pos; onChange: (p: Pos) => void; onNext: (from: { s: number; e: number } | null, to: Pos | null) => void }) {
  const seasons = [...brief.seasons.filter((s) => s.n > 0), ...brief.seasons.filter((s) => s.n === 0)];
  return (
    <div className="wx-pos" role="group" aria-label="Where are you?">
      <span className="wx-pos-l">Where are you?</span>
      <PositionPicker brief={brief} pos={pos} seasons={seasons} onChange={onChange} onNext={onNext} />
    </div>
  );
}

/**
 * One picker for "where are you": a single button ("S3 · E8 Bad Blood") opens one panel. Every season is a row (number, name, the months it aired, its episode
 * count); the open season shows its episodes (still, number, name, air date) and its row stays pinned at the top while you scroll them, so one tap on it
 * folds the season and lets you pick another. "Whole series" and "Whole season" stay as the first rows. Next sits beside it in the same pill.
 */
type BriefLite = Pick<WhoBrief, "id" | "seasons" | "status">;
/**
 * `strip` turns the picker into the place card's "Up next ▾" trigger (docs/features/place-card.md): `children` is the trigger's content, there is no Next button and no
 * "Whole series / Whole season" row, and episodes after `hideAfter` (the shown place) are listed by number only: no name, still or air date.
 */
export type StripMode = { children: React.ReactNode; hideAfter: { s: number; e: number } };
export function PositionPicker({ brief, pos, seasons, onChange, onNext, strip }: { brief: BriefLite; pos: Pos; seasons: WhoBrief["seasons"]; onChange: (p: Pos) => void; /** Without it the picker has no Next button (Search's "Who's that?" only looks). */ onNext?: (from: { s: number; e: number } | null, to: Pos | null) => void; strip?: StripMode }) {
  const [open, setOpen] = useState(false);
  const [openS, setOpenS] = useState<number | null>(pos.s); // the season whose episodes are shown (null: all folded)
  const [ranges, setRanges] = useState<Record<number, { start: string; end: string }>>({});
  const [bySeason, setBySeason] = useState<Record<number, WhoEp[] | "err">>({});
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const s = pos.s;

  // Episodes load per season (cached for the session by whoApi): the chosen season at once (the label names the episode), the others when opened.
  const load = (n: number) => {
    setBySeason((m) => (m[n] ? m : { ...m, [n]: [] })); // placeholder so a season is only asked for once
    whoApi.season(brief.id, n).then((r) => setBySeason((m) => ({ ...m, [n]: r.episodes }))).catch(() => setBySeason((m) => ({ ...m, [n]: "err" })));
  };
  useEffect(() => { setBySeason({}); setRanges({}); }, [brief.id]);
  useEffect(() => { if (s != null && !bySeason[s]) load(s); }, [brief.id, s]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && openS != null && !bySeason[openS]) load(openS); }, [open, openS]); // eslint-disable-line react-hooks/exhaustive-deps
  // Season dates come from each season's episode list: fetched when the panel first opens.
  useEffect(() => {
    if (!open) return;
    let live = true;
    seasons.forEach((x) => {
      whoApi.season(brief.id, x.n).then((r) => {
        const d = r.episodes.map((e) => e.air).filter(Boolean).sort();
        if (live && d.length) setRanges((m) => (m[x.n] ? m : { ...m, [x.n]: { start: d[0], end: d[d.length - 1] } }));
      }).catch(() => { /* the first air date stays */ });
    });
    return () => { live = false; };
  }, [open, brief.id, seasons]);

  useEffect(() => { if (open) setOpenS(s); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const away = (ev: MouseEvent) => { if (!wrap.current?.contains(ev.target as Node)) setOpen(false); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", away); window.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc, true); };
  }, [open]);
  // On open, focus the chosen episode (else the chosen season) and bring it into view.
  const eps0 = s != null ? bySeason[s] : undefined;
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const el = list.current?.querySelector<HTMLElement>('[aria-current="true"]') ?? list.current?.querySelector<HTMLElement>("button:not(:disabled)");
      el?.focus({ preventScroll: true }); el?.scrollIntoView({ block: "center" });
    }, 0);
    return () => clearTimeout(t);
  }, [open, Array.isArray(eps0) && eps0.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = (ev: React.KeyboardEvent) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { ev.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (ev.key === "ArrowDown") go(i + 1); else if (ev.key === "ArrowUp") go(i - 1); else if (ev.key === "Home") go(0); else if (ev.key === "End") go(items.length - 1);
  };
  const pick = (next: Pos) => { onChange(next); setOpen(false); btn.current?.focus(); };
  const when = (x: WhoBrief["seasons"][number]) => {
    const r = ranges[x.n];
    const d = r ? fmtRange(r.start, r.end) : x.air ? fmtRange(x.air, x.air) : "";
    return [d, x.eps ? `${x.eps} episode${x.eps === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || "Dates unknown";
  };

  const eps = s != null && Array.isArray(bySeason[s]) && (bySeason[s] as WhoEp[]).length ? (bySeason[s] as WhoEp[]) : null;
  const cur = pos.e != null ? eps?.find((x) => x.e === pos.e) : null;
  const hidden = (n: number, e: number) => !!strip && (n > strip.hideAfter.s || (n === strip.hideAfter.s && e > strip.hideAfter.e));
  const sl = s == null ? "Whole series" : s === 0 ? "Specials" : `S${s}`;
  const label = s == null ? "Whole series" : pos.e == null ? `${s === 0 ? "Specials" : `Season ${s}`} · Whole season` : `${sl} · E${pos.e}${cur?.name ? ` ${cur.name}` : ""}`;

  // Next: the next aired episode of this season, else the first aired episode of the next season that has aired.
  const nextEp = s == null ? undefined : eps?.find((x) => x.e > (pos.e ?? 0) && x.aired);
  const soon = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const nextSeason = s == null ? undefined : brief.seasons.filter((x) => x.n > s && x.air && x.air <= soon).sort((a, b) => a.n - b.n)[0];
  const from = s != null && s > 0 && pos.e != null && pos.e > 0 ? { s, e: pos.e } : null;
  // The very last episode of a series TMDB says has ended: Next finishes it (marks it watched and offers "Mark the series watched") instead of moving.
  const finale = !!from && seriesEnded(brief.status) && isLastEpisode(from, brief.seasons);
  const canNext = !!nextEp || (!!nextSeason && eps !== null) || finale;
  const next = async () => {
    if (!onNext) return;
    if (nextEp) return onNext(from, { s, e: nextEp.e });
    if (nextSeason) {
      try {
        const r = await whoApi.season(brief.id, nextSeason.n);
        const first = r.episodes.find((x) => x.aired);
        if (first) onNext(from, { s: nextSeason.n, e: first.e });
      } catch { /* stays where it is */ }
      return;
    }
    if (finale) onNext(from, null);
  };

  return (
    <div className={strip ? "ps-picker" : "wx-epgroup"}>
      <div className="wx-ep" ref={wrap}>
        {strip
          ? <button ref={btn} type="button" className="ps-trig" aria-haspopup="dialog" aria-expanded={open} aria-label="Change your place" onClick={() => setOpen((v) => !v)}>{strip.children}</button>
          : <button ref={btn} type="button" className="wx-epb" aria-haspopup="dialog" aria-expanded={open} aria-label={`Where you are: ${label}`} onClick={() => setOpen((v) => !v)}>
              <span className="wx-epl">{label}</span><span aria-hidden="true" className="wx-caret">▾</span>
            </button>}
        {open && (
          <div className="wx-eplist" role="dialog" aria-label="Season and episode" ref={list} onKeyDown={key}>
            {!strip && <button type="button" aria-current={s == null} className="wx-epo" onClick={() => pick({ s: null, e: null })}>
              <span className="wx-epn">?</span><span className="wx-epm"><b>Whole series</b><span className="small muted">Everyone in the whole series counts</span></span>
            </button>}
            {seasons.map((x) => {
              const isOpen = openS === x.n;
              const data = bySeason[x.n];
              return (
                <div key={x.n} className="wx-epsec" data-open={isOpen}>
                  <button type="button" className="wx-epo wx-epsh" aria-expanded={isOpen} aria-current={s === x.n && pos.e == null} onClick={() => setOpenS(isOpen ? null : x.n)}>
                    <span className="wx-epn">{x.n === 0 ? "S" : x.n}</span>
                    <span className="wx-epm"><b>{x.n === 0 ? "Specials" : `Season ${x.n}`}</b><span className="small muted">{when(x)}</span></span>
                    <span aria-hidden="true" className="wx-caret wx-epfold">{isOpen ? "▴" : "▾"}</span>
                  </button>
                  {isOpen && (
                    <>
                      {!strip && <button type="button" aria-current={s === x.n && pos.e == null} className="wx-epo" onClick={() => pick({ s: x.n, e: null })}>
                        <span className="wx-epn">?</span><span className="wx-epm"><b>Whole season</b><span className="small muted">Everyone in the whole season counts</span></span>
                      </button>}
                      {(!data || (Array.isArray(data) && !data.length)) && Array.from({ length: 4 }, (_, i) => <div key={i} className="wx-epo wx-epsk" aria-hidden="true"><span className="sk-b wx-epimg" /><span className="sk-b" style={{ flex: 1, height: 14 }} /></div>)}
                      {data === "err" && <p className="small muted" style={{ padding: 12 }}>Couldn&rsquo;t load the episodes. Fold this season and open it again.</p>}
                      {Array.isArray(data) && data.map((e) => {
                        const h = hidden(x.n, e.e);
                        return (
                          <button key={e.e} type="button" aria-current={s === x.n && pos.e === e.e} disabled={!e.aired} className="wx-epo" onClick={() => pick({ s: x.n, e: e.e })}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {e.still && !h ? <img className="wx-epimg" src={img(e.still, "w185")} alt="" loading="lazy" /> : <span className="wx-epimg wx-noph" aria-hidden="true" />}
                            <span className="wx-epn">{e.e}</span>
                            <span className="wx-epm"><b>{(!h && e.name) || `Episode ${e.e}`}</b>{!h && <span className="small muted">{e.aired ? fmtDay(e.air) : e.air ? `Not aired yet · ${fmtDay(e.air)}` : "Not aired yet"}</span>}</span>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {onNext && !strip && <button type="button" className="wx-epnext" disabled={!canNext} onClick={next} aria-label={nextEp ? `Next episode: E${nextEp.e}` : nextSeason ? `Next season: S${nextSeason.n}` : "Next episode"} title="Finished this one: go to the next episode">
        <span>Next</span>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 5.5v13l8.5-6.5zM17 5.5v13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>}
    </div>
  );
}

/**
 * A film's clock, in the slot the episode picker takes for a series: play/pause the minutes, and move how far in you are by five. Play and +-5 are real
 * "I am watching this" signals (a title that is not Watching moves to Watching); pause is not. Once the minutes reach the runtime a quiet, dismissible
 * "Finished? Mark watched" line shows (never automatic, at most once per watch).
 */
export function FilmClock({ item, runtime }: { item: Item; runtime: number | null }) {
  const wc = useWatchControl();
  const lib = useLib();
  const [now, setNow] = useState(() => Date.now());
  const [hidden, setHidden] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const w = wc?.watch && wc.watch.key === item.key ? wc.watch : null;
  // Film resume (docs/features/film-resume.md): where the clock stands is saved to the library row with ONE debounced write after a change, at once on
  // pause, and when the page is hidden or left. Never while the film is not Watching in the library, and never after it was marked Watched here.
  const wRef = useRef(w); wRef.current = w;
  const libRef = useRef(lib); libRef.current = lib;
  const rtRef = useRef(runtime); rtRef.current = runtime;
  const last = useRef<number | null>(lib.get(item.key)?.stopped ?? null);
  const finished = useRef(false);
  const flush = useRef(() => {});
  flush.current = () => {
    const cur = wRef.current, l = libRef.current;
    if (!cur || finished.current || l.get(item.key)?.status !== "watching") return;
    const wr = stoppedWrite(elapsedMin(cur, Date.now()), cur.runtime ?? rtRef.current, last.current);
    if (!wr) return;
    const prior = last.current;
    last.current = wr.min;
    setStopped(item.id, wr.min, wr.of).then(() => { if (!finished.current) l.setStopped(item.key, wr.min ?? undefined); }).catch(() => { last.current = prior; });
  };
  useEffect(() => {
    if (!w) return;
    const t = setTimeout(() => flush.current(), w.paused ? 0 : 1500);
    return () => clearTimeout(t);
  }, [w?.started, w?.paused]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") flush.current(); };
    document.addEventListener("visibilitychange", hide); window.addEventListener("pagehide", hide);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", hide); flush.current(); };
  }, []);
  if (!w || !wc) return null;
  const paused = !!w.paused;
  const signal = () => { wc.signal(item, runtime ?? w.runtime).catch(() => {}); };
  const patch = (f: (x: Watch) => Watch) => wc.patchWatch(item.key, f);
  const showDone = !hidden && filmDone(elapsedMin(w, now), w.runtime ?? runtime) && !promptDone(item.key);
  const dismiss = () => { markPromptDone(item.key); setHidden(true); };
  return (
    <div className="wx-pos" role="group" aria-label="How far in">
      <span className="wx-pos-l">How far in</span>
      <span className={`ask-step${paused ? " paused" : ""}`}>
        <button type="button" onClick={() => { if (paused) signal(); patch((x) => setPaused(x, !paused)); }} aria-label={paused ? "Resume the minutes" : "Pause the minutes"} aria-pressed={paused} title={paused ? "Resume counting" : "Pause counting"}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            {paused ? <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /> : <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />}
          </svg>
        </button>
        <button type="button" onClick={() => { signal(); patch((x) => shiftWatch(x, -5)); }} aria-label="5 minutes less">&minus;5</button>
        <b>{whereLabel(w, now).replace(" · paused", "")}</b>
        <button type="button" onClick={() => { signal(); patch((x) => shiftWatch(x, 5)); }} aria-label="5 minutes more">+5</button>
      </span>
      {showDone && (
        <span className="wx-finish" role="status">
          Finished?{" "}
          <button type="button" className="linkish" onClick={() => { finished.current = true; markPromptDone(item.key); lib.mark(item, "watched", undefined, true); wc.stop({ restore: false }); }}>Mark watched</button>
          <button type="button" className="linkish muted" aria-label="Dismiss" onClick={dismiss}>&#215;</button>
        </span>
      )}
    </div>
  );
}
