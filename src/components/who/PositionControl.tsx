"use client";
import { useEffect, useId, useRef, useState } from "react";
import { img } from "@/lib/img";
import { fmtDay } from "@/lib/who-dates";
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
      <label className="wx-sel">
        <span className="sr-only">Season</span>
        <select value={unsure ? "" : String(pos.s)} onChange={(ev) => ev.target.value !== "" && onChange({ s: Number(ev.target.value), e: null })} aria-label="Season">
          {unsure && <option value="" disabled>Season…</option>}
          {seasons.map((s) => <option key={s.n} value={s.n}>{s.n === 0 ? "Specials" : `Season ${s.n}`}</option>)}
        </select>
      </label>
      <EpisodePicker brief={brief} pos={pos} onChange={onChange} />
      <button type="button" className="chip wx-unsure" aria-pressed={unsure} onClick={() => onChange(unsure ? { s: seasons.find((x) => x.n > 0)?.n ?? 1, e: null } : { s: null, e: null })}>
        Not sure of the season
      </button>
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
  const label = s == null ? "Pick a season first" : pos.e == null ? "Not sure" : `E${pos.e}${cur?.name ? ` · ${cur.name}` : ""}`;
  const pick = (e: number | null) => { onChange({ s, e }); setOpen(false); btn.current?.focus(); };
  return (
    <div className="wx-ep" ref={wrap}>
      <button ref={btn} type="button" className="wx-epb" disabled={s == null} aria-haspopup="listbox" aria-expanded={open} aria-label={`Episode: ${label}`} onClick={() => setOpen((v) => !v)}>
        <span className="wx-epl">{label}</span><span aria-hidden="true" className="wx-caret">▾</span>
      </button>
      {open && (
        <div className="wx-eplist" role="listbox" aria-label="Episodes" ref={list} onKeyDown={key}>
          <button type="button" role="option" aria-selected={pos.e == null} className="wx-epo" onClick={() => pick(null)}>
            <span className="wx-epn">?</span><span className="wx-epm"><b>Not sure</b><span className="small muted">Everyone in the whole season counts</span></span>
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
  );
}
