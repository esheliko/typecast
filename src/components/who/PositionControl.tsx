"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useWatchControl } from "../Watching";
import { setPaused, shiftWatch, whereLabel } from "@/lib/watching";
import { img } from "@/lib/img";
import { fmtDay, fmtRange } from "@/lib/who-dates";
import { whoApi } from "@/lib/who-client";
import type { WhoBrief, WhoEp } from "@/lib/who-data";
import type { Pos } from "@/lib/who-types";

/** "Where are you?": season, episode (first option "Not sure", then the season's episodes with stills, never summaries) and "Not sure of the season". Series only. */
export function PositionControl({ brief, pos, onChange }: { brief: WhoBrief; pos: Pos; onChange: (p: Pos) => void }) {
  const seasons = [...brief.seasons.filter((s) => s.n > 0), ...brief.seasons.filter((s) => s.n === 0)];
  const unsure = pos.s == null;
  const id = useId();
  return (
    <div className="wx-pos" role="group" aria-label="Where are you?">
      <span className="wx-pos-l" id={`${id}-l`}>Where are you?</span>
      <SeasonPicker brief={brief} pos={pos} seasons={seasons} onChange={onChange} />
      <EpisodePicker brief={brief} pos={pos} onChange={onChange} />
    </div>
  );
}

/** The season list: the same popup as the episode list, each season with the months it aired (first to last episode) and its episode count. */
function SeasonPicker({ brief, pos, seasons, onChange }: { brief: WhoBrief; pos: Pos; seasons: WhoBrief["seasons"]; onChange: (p: Pos) => void }) {
  const [open, setOpen] = useState(false);
  const [ranges, setRanges] = useState<Record<number, { start: string; end: string }>>({});
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const s = pos.s;

  // Season dates come from each season's episode list (cached for the session): fetched when the list first opens.
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
  useEffect(() => {
    if (!open) return;
    const away = (ev: MouseEvent) => { if (!wrap.current?.contains(ev.target as Node)) setOpen(false); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", away); window.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => (list.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.current?.querySelector<HTMLElement>("button:not(:disabled)"))?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);
  const key = (ev: React.KeyboardEvent) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { ev.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (ev.key === "ArrowDown") go(i + 1); else if (ev.key === "ArrowUp") go(i - 1); else if (ev.key === "Home") go(0); else if (ev.key === "End") go(items.length - 1);
  };
  const pick = (n: number | null) => { onChange({ s: n, e: null }); setOpen(false); btn.current?.focus(); };
  const when = (x: WhoBrief["seasons"][number]) => {
    const r = ranges[x.n];
    const d = r ? fmtRange(r.start, r.end) : x.air ? fmtRange(x.air, x.air) : "";
    return [d, x.eps ? `${x.eps} episode${x.eps === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || "Dates unknown";
  };
  const label = s == null ? "Whole series" : s === 0 ? "Specials" : `Season ${s}`;
  return (
    <div className="wx-ep" ref={wrap}>
      <button ref={btn} type="button" className="wx-epb" aria-haspopup="listbox" aria-expanded={open} aria-label={`Season: ${label}`} onClick={() => setOpen((v) => !v)}>
        <span className="wx-epl">{label}</span><span aria-hidden="true" className="wx-caret">▾</span>
      </button>
      {open && (
        <div className="wx-eplist" role="listbox" aria-label="Seasons" ref={list} onKeyDown={key}>
          <button type="button" role="option" aria-selected={s == null} className="wx-epo" onClick={() => pick(null)}>
            <span className="wx-epn">?</span><span className="wx-epm"><b>Whole series</b><span className="small muted">Everyone in the whole series counts</span></span>
          </button>
          {seasons.map((x) => (
            <button key={x.n} type="button" role="option" aria-selected={s === x.n} className="wx-epo" onClick={() => pick(x.n)}>
              <span className="wx-epn">{x.n === 0 ? "S" : x.n}</span>
              <span className="wx-epm"><b>{x.n === 0 ? "Specials" : `Season ${x.n}`}</b><span className="small muted">{when(x)}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EpisodePicker({ brief, pos, onChange }: { brief: WhoBrief; pos: Pos; onChange: (p: Pos) => void }) {
  const [open, setOpen] = useState(false);
  const [eps, setEps] = useState<WhoEp[] | null>(null);
  const [err, setErr] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const s = pos.s;

  // The season's episodes: fetched when the season changes (so the label can name the chosen episode) and cached for the session.
  useEffect(() => {
    if (s == null) { setEps(null); return; }
    let live = true;
    setEps(null); setErr(false);
    whoApi.season(brief.id, s).then((r) => { if (live) setEps(r.episodes); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [brief.id, s]);

  useEffect(() => { setOpen(false); }, [s]);
  useEffect(() => {
    if (!open) return;
    const away = (ev: MouseEvent) => { if (!wrap.current?.contains(ev.target as Node)) setOpen(false); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", away); window.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc, true); };
  }, [open]);
  // Move focus into the list when it opens: the chosen episode, else "Not sure".
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => (list.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.current?.querySelector<HTMLElement>("button:not(:disabled)"))?.focus(), 0);
    return () => clearTimeout(t);
  }, [open, eps]);

  const key = (ev: React.KeyboardEvent) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { ev.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (ev.key === "ArrowDown") go(i + 1); else if (ev.key === "ArrowUp") go(i - 1); else if (ev.key === "Home") go(0); else if (ev.key === "End") go(items.length - 1);
  };

  const cur = pos.e != null ? eps?.find((x) => x.e === pos.e) : null;
  const label = s == null ? "Pick a season first" : pos.e == null ? "Whole season" : `E${pos.e}${cur?.name ? ` · ${cur.name}` : ""}`;
  const pick = (e: number | null) => { onChange({ s, e }); setOpen(false); btn.current?.focus(); };

  // Next: the next aired episode of this season, else the first aired episode of the next season that has aired.
  const nextEp = s == null ? undefined : eps?.find((x) => x.e > (pos.e ?? 0) && x.aired);
  const soon = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const nextSeason = s == null ? undefined : brief.seasons.filter((x) => x.n > s && x.air && x.air <= soon).sort((a, b) => a.n - b.n)[0];
  const canNext = !!nextEp || (!!nextSeason && eps !== null);
  const next = async () => {
    if (nextEp) return onChange({ s, e: nextEp.e });
    if (!nextSeason) return;
    try {
      const r = await whoApi.season(brief.id, nextSeason.n);
      const first = r.episodes.find((x) => x.aired);
      if (first) onChange({ s: nextSeason.n, e: first.e });
    } catch { /* stays where it is */ }
  };
  return (
    <div className="wx-epgroup">
    <div className="wx-ep" ref={wrap}>
      <button ref={btn} type="button" className="wx-epb" disabled={s == null} aria-haspopup="listbox" aria-expanded={open} aria-label={`Episode: ${label}`} onClick={() => setOpen((v) => !v)}>
        <span className="wx-epl">{label}</span><span aria-hidden="true" className="wx-caret">▾</span>
      </button>
      {open && (
        <div className="wx-eplist" role="listbox" aria-label="Episodes" ref={list} onKeyDown={key}>
          <button type="button" role="option" aria-selected={pos.e == null} className="wx-epo" onClick={() => pick(null)}>
            <span className="wx-epn">?</span><span className="wx-epm"><b>Whole season</b><span className="small muted">Everyone in the whole season counts</span></span>
          </button>
          {!eps && !err && Array.from({ length: 6 }, (_, i) => <div key={i} className="wx-epo wx-epsk" aria-hidden="true"><span className="sk-b wx-epimg" /><span className="sk-b" style={{ flex: 1, height: 14 }} /></div>)}
          {err && <p className="small muted" style={{ padding: 12 }}>Couldn&rsquo;t load the episodes. Close this and try again.</p>}
          {eps?.map((x) => (
            <button key={x.e} type="button" role="option" aria-selected={pos.e === x.e} disabled={!x.aired} className="wx-epo" onClick={() => pick(x.e)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {x.still ? <img className="wx-epimg" src={img(x.still, "w185")} alt="" loading="lazy" /> : <span className="wx-epimg wx-noph" aria-hidden="true" />}
              <span className="wx-epn">{x.e}</span>
              <span className="wx-epm"><b>{x.name || `Episode ${x.e}`}</b><span className="small muted">{x.aired ? fmtDay(x.air) : x.air ? `Not aired yet · ${fmtDay(x.air)}` : "Not aired yet"}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
      <button type="button" className="wx-epnext" disabled={!canNext} onClick={next} aria-label={nextEp ? `Next episode: E${nextEp.e}` : nextSeason ? `Next season: S${nextSeason.n}` : "Next episode"} title="Go to the next episode">
        <span>Next</span>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 5.5v13l8.5-6.5zM17 5.5v13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </div>
  );
}

/** A film's clock, in the slot the episode picker takes for a series: play/pause the minutes, and move how far in you are by five. */
export function FilmClock({ briefKey }: { briefKey: string }) {
  const wc = useWatchControl();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const w = wc?.watch && wc.watch.key === briefKey ? wc.watch : null;
  if (!w || !wc) return null;
  const paused = !!w.paused;
  return (
    <div className="wx-pos" role="group" aria-label="How far in">
      <span className="wx-pos-l">How far in</span>
      <span className={`ask-step${paused ? " paused" : ""}`}>
        <button type="button" onClick={() => wc.save(setPaused(w, !paused))} aria-label={paused ? "Resume the minutes" : "Pause the minutes"} aria-pressed={paused} title={paused ? "Resume counting" : "Pause counting"}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            {paused ? <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /> : <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />}
          </svg>
        </button>
        <button type="button" onClick={() => wc.save(shiftWatch(w, -5))} aria-label="5 minutes less">&minus;5</button>
        <b>{whereLabel(w, now).replace(" · paused", "")}</b>
        <button type="button" onClick={() => wc.save(shiftWatch(w, 5))} aria-label="5 minutes more">+5</button>
      </span>
    </div>
  );
}
