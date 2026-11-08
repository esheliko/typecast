"use client";
import { useEffect, useRef, useState } from "react";
import { useBackClose } from "@/lib/back-layer";
import { createPortal } from "react-dom";
import { addImported, setStatus } from "@/app/actions";
import { img } from "@/lib/img";
import { titleSpec } from "@/lib/glimpse";
import { useGlimpse } from "./Glimpse";
import { TitleLink } from "./Modal";
import type { Applied, Failed, Unmatched, Unsure } from "@/lib/letterboxd";
import type { BrowseItem, SearchHit, Status } from "@/lib/types";

/** What the import (or a fix made in the review) did to one title, kept so the whole import can be reverted. */
export type Rec = Pick<Applied, "type" | "id" | "isNew" | "prev">;
export type ReviewRow = { id: string; label: string; item: BrowseItem | null; status: Status; rating: number; isNew: boolean; gone?: boolean; err?: string; recs: Rec[]; /** Why this line was not imported (set for lines that were not found or could not be saved). */ problem?: string; /** A low-confidence match, not saved yet: `item` is the best guess and `alts` other likely titles. */ unsure?: { why: string; weak?: boolean; alts: BrowseItem[] } };
/** Lines that are not in the library yet (not found, failed, or waiting for the user to confirm a guess). */
export const unsaved = (r: ReviewRow) => !!r.problem || !!r.unsure;
/** Review order: broken lines first, then the ones to confirm, then the rest. */
export const rank = (r: ReviewRow) => (r.problem ? 0 : r.unsure ? 1 : 2);

let n = 0;
export const toRows = (items: Applied[], missing: Unmatched[], failed: Failed[] = [], unsure: Unsure[] = []): ReviewRow[] => [
  ...unsure.map((u): ReviewRow => ({ id: `r${n++}`, label: u.label, item: u.guess, status: u.status, rating: u.rating, isNew: true, recs: [], unsure: { why: u.why, weak: u.weak, alts: u.alts } })),
  ...missing.map((m): ReviewRow => ({ id: `r${n++}`, label: m.label, item: null, status: m.status, rating: m.rating, isNew: true, recs: [], problem: m.error ?? "Not found on TMDB." })),
  ...failed.map((f): ReviewRow => ({ id: `r${n++}`, label: f.label, item: { key: `${f.type}:${f.id}`, type: f.type, id: f.id, title: f.title, year: f.year, poster: f.poster, rating: 0 }, status: f.status, rating: f.rating, isNew: false, recs: [], problem: `Matched, but it could not be saved (${f.error}).` })),
  ...items.map((a): ReviewRow => ({ id: `r${n++}`, label: a.label, item: { key: `${a.type}:${a.id}`, type: a.type, id: a.id, title: a.title, year: a.year, poster: a.poster, rating: 0 }, status: a.status, rating: a.rating, isNew: a.isNew, recs: [{ type: a.type, id: a.id, isNew: a.isNew, prev: a.prev }] })),
];

const OPTIONS: [Status, string][] = [["watched", "Watched"], ["watching", "Watching"], ["watchlist", "To watch"]];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * The import review as a popup (same frame as the title popup): every title the import touched, with the original text, so a wrong
 * match or marking can be fixed, plus a button that reverses the whole import.
 */
export default function ImportReviewDialog({ rows, onChange, onClose, onRevert }: { rows: ReviewRow[]; onChange: (update: (rows: ReviewRow[]) => ReviewRow[]) => void; onClose: () => void; onRevert: () => Promise<void> }) {
  const box = useRef<HTMLDivElement>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [reverting, setReverting] = useState(false);
  useBackClose(true, () => { if (!reverting) onClose(); });
  const [revertErr, setRevertErr] = useState("");
  const patch = (id: string, p: Partial<ReviewRow>) => onChange((cur) => cur.map((r) => (r.id === id ? { ...r, ...p } : r)));

  useEffect(() => {
    const was = document.activeElement as HTMLElement | null;
    box.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; if (was && document.contains(was)) was.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = box.current; if (!el) return;
      // A title popup or image panel opened from a row is on top: leave its keys alone.
      if (document.activeElement !== el && !el.contains(document.activeElement)) return;
      if (e.key === "Escape" && !(e.target as HTMLElement).closest("input,textarea,select")) { e.preventDefault(); if (!reverting) onClose(); }
      if (e.key === "Tab") {
        const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1], at = document.activeElement;
        if (e.shiftKey && (at === first || at === el)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [onClose, reverting]);

  async function guard(r: ReviewRow, f: () => Promise<void>) {
    setBusy(r.id);
    try { await f(); patch(r.id, { err: undefined }); } catch { patch(r.id, { err: "That did not save. Try again." }); }
    setBusy(null);
  }
  /** Saves the title (first time for lines that were not imported), recording what it replaced so Revert can undo it. */
  const mark = (r: ReviewRow, status: Status) => guard(r, async () => {
    if (!r.item) { patch(r.id, { status }); return; }
    if (unsaved(r)) {
      const rec = await addImported(r.item, status, r.rating);
      patch(r.id, { status, problem: undefined, unsure: undefined, isNew: rec.isNew, recs: [...r.recs, { type: r.item.type, id: r.item.id, ...rec }] });
    } else { await setStatus(r.item, status); patch(r.id, { status }); }
  });
  const remove = (r: ReviewRow) => guard(r, async () => { if (r.item) await setStatus(r.item, null); patch(r.id, { gone: true }); });
  const swap = (r: ReviewRow, next: BrowseItem) => guard(r, async () => {
    if (r.item && r.isNew && !unsaved(r)) await setStatus(r.item, null);
    const rec = await addImported(next, r.status, r.rating);
    patch(r.id, { item: next, isNew: rec.isNew, gone: false, problem: undefined, unsure: undefined, recs: [...r.recs, { type: next.type, id: next.id, ...rec }] });
    setFixing(null);
  });

  /** A line that meant two titles ("Inside Out 1,2"): saves another title under the same line, as its own row. */
  const addAnother = (r: ReviewRow, next: BrowseItem) => guard(r, async () => {
    const rec = await addImported(next, r.status, r.rating);
    const row: ReviewRow = { id: `r${n++}`, label: r.label, item: next, status: r.status, rating: r.rating, isNew: rec.isNew, recs: [{ type: next.type, id: next.id, ...rec }] };
    onChange((cur) => { const i = cur.findIndex((x) => x.id === r.id); return [...cur.slice(0, i + 1), row, ...cur.slice(i + 1)]; });
    setAdding(null);
  });

  /** Accept every suggestion in one go, one title at a time so a failure only leaves that line for the user. */
  async function approveAll() {
    setBulk(true);
    for (const r of toCheck) {
      setBusy(r.id);
      try { const rec = await addImported(r.item!, r.status, r.rating); patch(r.id, { problem: undefined, unsure: undefined, isNew: rec.isNew, err: undefined, recs: [...r.recs, { type: r.item!.type, id: r.item!.id, ...rec }] }); }
      catch { patch(r.id, { err: "That did not save. Try again." }); }
    }
    setBusy(null); setBulk(false);
  }

  async function revert() {
    setReverting(true); setRevertErr("");
    try { await onRevert(); } catch { setRevertErr("The revert did not finish. Nothing more was changed. Try again."); setReverting(false); }
  }

  const live = rows.filter((r) => !r.gone);
  const problems = live.filter((r) => r.problem).length;
  const toCheck = live.filter((r) => r.unsure && r.item && !r.unsure.weak);
  const removes = live.filter((r) => r.item && r.isNew && !unsaved(r)).length, restores = rows.flatMap((r) => r.recs).filter((x) => !x.isNew && x.prev).length;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={box} className="modal" style={{ zIndex: 39 }} role="dialog" aria-modal="true" aria-label="Review import" tabIndex={-1} onClick={(e) => { if (e.target === e.currentTarget && !reverting) onClose(); }}>
      <div className="sheet">
        <div className="sheet-bar">
          <b>Review import</b>
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn sm" disabled={reverting || confirm || (removes === 0 && restores === 0)} onClick={() => setConfirm(true)}>Revert import</button>
            <button type="button" className="btn sm gold" onClick={onClose} disabled={reverting}>Done</button>
          </span>
        </div>
        <div className="sheet-body" style={{ paddingTop: 12 }}>
          {(confirm || revertErr) && (
            <div className="card pad" style={{ padding: 10, margin: "0 0 10px" }} aria-busy={reverting}>
              {confirm && <>
                <p style={{ margin: "0 0 10px" }}><b>Revert the whole import?</b> {removes} added title{removes === 1 ? "" : "s"} will be removed{restores ? ` and ${restores} changed title${restores === 1 ? "" : "s"} restored` : ""}. Anything you marked or rated yourself on those titles after importing goes with them.</p>
                <div className="chips">
                  <button className="btn gold" type="button" disabled={reverting} onClick={revert}>{reverting ? "Reverting…" : "Yes, revert it"}</button>
                  <button className="btn" type="button" disabled={reverting} onClick={() => setConfirm(false)}>Cancel</button>
                </div>
              </>}
              {revertErr && <p className="small err" style={{ margin: confirm ? "8px 0 0" : 0 }}>{revertErr}</p>}
            </div>
          )}
          {problems > 0 && <p className="small err" style={{ margin: "0 0 4px" }}><b>{problems} could not be imported.</b> They are at the top: search for the right title, retry, or skip each one.</p>}
          {toCheck.length > 0 && (
            <div className="card pad" style={{ padding: 10, margin: "0 0 10px" }}>
              <p style={{ margin: 0 }}><b>{toCheck.length} not sure.</b> <span className="muted">Nothing is added until you confirm. Say yes to the guess, tap another title, or search.</span></p>
              <button className="btn sm" type="button" style={{ marginTop: 8 }} disabled={bulk || !!busy} onClick={approveAll}>{bulk ? "Adding…" : toCheck.length === 1 ? "Add the guess" : `Add all ${toCheck.length} guesses`}</button>
            </div>
          )}
          <p className="small muted" style={{ margin: "0 0 10px" }}>Check each title against what you wrote. Change the marking, remove it, or pick the right title. Changes save at once.</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {live.map((r) => (
              <li key={r.id} className="card pad" style={{ padding: 10 }} aria-busy={busy === r.id}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.item?.poster ? <img className="thumb" src={img(r.item.poster, "w92")} alt="" loading="lazy" /> : <div className="thumb" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{r.item ? `${r.item.title}${r.item.year ? ` (${r.item.year})` : ""}${r.item.type === "tv" ? " · TV" : ""}` : "Not imported"}</div>
                    <div className="small muted" dir="auto">You wrote: {r.label}</div>
                    {r.problem && <div className="small err">{r.problem} Pick the right title, or skip it.</div>}
                    {r.unsure && <div className="small" style={{ color: "var(--gold, #d4a017)" }}><b>{r.unsure.weak ? "Couldn't match this." : "Not sure."}</b> {r.unsure.why} {r.unsure.weak ? "Is this it, or search?" : "Is this it?"}</div>}
                    {!r.isNew && !unsaved(r) && <div className="small muted">Already in your library.</div>}
                  </div>
                  {r.item && <Peek it={r.item} />}
                </div>
                <div className="chips" style={{ marginTop: 8, alignItems: "center" }}>
                  {r.item ? (
                    <select aria-label={`Marking for ${r.label}`} value={r.status} disabled={busy === r.id} onChange={(e) => mark(r, e.target.value as Status)}>
                      {OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      {r.status === "partial" && <option value="partial">Partly watched</option>}
                    </select>
                  ) : <span className="small muted">Would be {OPTIONS.find((o) => o[0] === r.status)?.[1].toLowerCase()}</span>}
                  {r.item && r.unsure && <button className="btn sm gold" type="button" disabled={busy === r.id || bulk} onClick={() => mark(r, r.status)}>Yes, add it</button>}
                  {r.item && r.problem && <button className="btn sm gold" type="button" disabled={busy === r.id} onClick={() => mark(r, r.status)}>Try again</button>}
                  <button className="btn sm" type="button" aria-expanded={fixing === r.id} onClick={() => setFixing(fixing === r.id ? null : r.id)}>{r.item && !r.problem && !r.unsure ? "Wrong title?" : r.unsure ? "Search" : "Find it"}</button>
                  <button className="btn sm" type="button" aria-expanded={adding === r.id} onClick={() => setAdding(adding === r.id ? null : r.id)}>Add another title</button>
                  {r.item && r.isNew && !unsaved(r) && <button className="btn sm" type="button" disabled={busy === r.id} onClick={() => remove(r)}>Remove</button>}
                  {(!r.item || unsaved(r)) && <button className="btn sm" type="button" onClick={() => patch(r.id, { gone: true })}>Skip</button>}
                </div>
                {r.unsure && r.unsure.alts.length > 0 && fixing !== r.id && (
                  <div style={{ marginTop: 8 }}>
                    <div className="small muted">Or did you mean:</div>
                    <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0, display: "grid", gap: 2 }}>
                      {r.unsure.alts.map((a) => (
                        <li key={a.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button type="button" disabled={busy === r.id || bulk} onClick={() => swap(r, a)} style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, minWidth: 0, textAlign: "start", background: "none", border: 0, padding: 6, cursor: "pointer", color: "inherit", font: "inherit" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {a.poster ? <img className="thumb" src={img(a.poster, "w92")} alt="" loading="lazy" /> : <div className="thumb" />}
                            <span>{a.title}{a.year ? ` (${a.year})` : ""}<span className="small muted">{a.type === "tv" ? " · TV" : " · Film"}</span></span>
                          </button>
                          <Peek it={a} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {fixing === r.id && <Picker start={r.label} onPick={(it) => swap(r, it)} />}
                {adding === r.id && <div><p className="small muted" style={{ margin: "8px 0 0" }}>This line meant more than one title? Pick the other one; it is added as {OPTIONS.find((o) => o[0] === r.status)?.[1].toLowerCase()}.</p><Picker start={r.label} onPick={(it) => addAnother(r, it)} /></div>}
                {r.err && <p className="small err" style={{ margin: "6px 0 0" }}>{r.err}</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Two ways to check which title this is: its full popup (cast, plot, where to watch) or a quick look at images from it. */
function Peek({ it }: { it: BrowseItem }) {
  const glimpse = useGlimpse();
  return (
    <span style={{ display: "inline-flex", gap: 6, flexShrink: 0 }}>
      <TitleLink k={it.key} it={it} className="btn sm" aria-label={`Open ${it.title}`}>Details</TitleLink>
      <button type="button" className="btn sm" aria-label={`Images of ${it.title}`} onClick={() => glimpse(titleSpec(it))}>Images</button>
    </span>
  );
}

/** Title search shown under a row. The results sit in the flow of the popup, so they are always next to the box and scroll with it. */
function Picker({ start, onPick }: { start: string; onPick: (it: BrowseItem) => void }) {
  const [q, setQ] = useState(start.replace(/\s*\([^)]*\)\s*$/, ""));
  const [hits, setHits] = useState<BrowseItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?kind=title&q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as { hits?: SearchHit[] };
        setHits((d.hits ?? []).filter((h): h is Extract<SearchHit, { kind: "title" }> => h.kind === "title").slice(0, 8)); setFailed(false);
      } catch (e) { if ((e as Error).name !== "AbortError") setFailed(true); }
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);
  return (
    <div style={{ marginTop: 8 }}>
      <input type="search" aria-label="Search for the right title" placeholder="Search for the right title" value={q} onChange={(e) => setQ(e.target.value)} dir="auto" style={{ width: "100%" }} autoFocus />
      {failed && <p className="small err" style={{ margin: "6px 0 0" }}>Search did not work. Check your connection and keep typing to retry.</p>}
      {hits && !failed && (
        <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "grid", gap: 2, maxHeight: 320, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 12 }}>
          {hits.length === 0 && <li className="small muted" style={{ padding: 10 }}>No results.</li>}
          {hits.map((h) => (
            <li key={h.key} style={{ display: "flex", alignItems: "center", gap: 6, paddingInlineEnd: 6 }}>
              <button type="button" onClick={() => onPick(h)} style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, minWidth: 0, textAlign: "start", background: "none", border: 0, padding: 8, cursor: "pointer", color: "inherit", font: "inherit" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {h.poster ? <img className="thumb" src={img(h.poster, "w92")} alt="" loading="lazy" /> : <div className="thumb" />}
                <span>{h.title}{h.year ? ` (${h.year})` : ""}<span className="small muted">{h.type === "tv" ? " · TV" : " · Film"}</span></span>
              </button>
              <Peek it={h} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
