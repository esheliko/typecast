"use client";
import { TitleLink } from "../Modal";
import { GlimpseButton } from "../Glimpse";
import { titleSpec } from "@/lib/glimpse";
import { useEffect, useRef, useState } from "react";
import { lockScroll } from "@/lib/scroll-lock";
import { keepHistory, useBackClose } from "@/lib/back-layer";
import { useLib } from "./LibState";
import QuickMark from "./QuickMark";
import { KindSeg } from "../KindSeg";
import { mixed, ofKind, type Kind } from "@/lib/kind";
import { img, typeLabel } from "@/lib/img";
import type { Item } from "@/lib/types";

/** Titles that belong together (a collection, a shared universe), in release order. */
export interface Group { label: string; items: Item[]; by?: string }

/** Ways to find related titles, each showing one signal on its own. Recommended is selected first. */
const MODES = [["franchise", "Same franchise"], ["creator", "Creator"], ["names", "Similar names"], ["recommended", "Recommended"], ["themes", "Themes"]] as const;
const FIRST: Mode = "franchise"; // falls back to "recommended" when the title has no franchise
type Mode = (typeof MODES)[number][0];

/**
 * The checklist for one group. Each row has the usual one-tap marks, and the group header
 * offers "All watched" so a franchise you have mostly seen is marked in a couple of taps.
 */
export function FranchiseList({ groups: raw, onNavigate, include }: { groups: Group[]; onNavigate?: () => void; include?: Item }) {
  const { get, markMany } = useLib();
  // The title you came from belongs in its own franchise: slot it in by year (before later entries of the same year).
  const groups = include ? raw.map((g) => {
    if (g.items.some((i) => i.key === include.key)) return g;
    const at = g.items.findIndex((i) => i.year >= include.year);
    const items = [...g.items]; items.splice(at < 0 ? items.length : at, 0, include);
    return { ...g, items };
  }) : raw;
  const [kind, setKind] = useState<Kind>("all");
  const every = groups.flatMap((g) => g.items);
  const shown = groups.map((g) => ({ ...g, items: ofKind(g.items, kind) })).filter((g) => g.items.length);
  return (
    <div className="fr">
      {(kind !== "all" || mixed(every)) && <div className="kind-bar"><KindSeg value={kind} onChange={setKind} /></div>}
      {!shown.length && <p className="small muted">No {kind === "tv" ? "series" : "films"} here.</p>}
      {shown.map((g) => {
        const open = g.items.filter((i) => !get(i.key));
        return (
          <section key={g.label} aria-label={g.label}>
            <div className="fr-head">
              <h3>{g.label}</h3>
              <span className="small muted">{g.items.length - open.length} of {g.items.length} marked</span>
              {open.length > 0 && <button type="button" className="btn sm" onClick={() => markMany(open, "watched")}>All watched · {open.length}</button>}
            </div>
            <ul className="rows card">
              {g.items.map((it) => (
                  <li key={it.key} className={`fr-row${get(it.key)?.status === "watched" ? " done" : ""}${it.key === include?.key ? " origin" : ""}`}>
                    <TitleLink className="fr-main" k={it.key} it={it} onClick={onNavigate}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {it.poster ? <img className="thumb" src={img(it.poster, "w92")} alt="" loading="lazy" /> : <span className="thumb" />}
                      <span className="row-main">
                        <span className="row-title" style={{ fontSize: 17 }}>{it.title}</span>
                        <span className="row-sub">{it.year} · {typeLabel(it.type)}{it.key === include?.key ? " · you marked this" : ""}</span>
                      </span>
                    </TitleLink>
                    <div className="fr-act">
                      <GlimpseButton spec={titleSpec(it)} />
                      <QuickMark it={it} variant="inline" quiet />
                    </div>
                  </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Bottom sheet opened from the "Mark related" button on the toast after marking something Watched. */
export function FranchiseSheet({ it, load, loadSimilar, onClose }: { it: Item; load: (it: Item) => Promise<Group[]>; loadSimilar?: (it: Item) => Promise<Group[]>; onClose: () => void }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  useBackClose(true, onClose);
  const [mode, setMode] = useState<Mode>(FIRST);
  const picked = useRef(false); // true once the user taps a pill, so the empty-franchise fallback never overrides them
  const [all, setAll] = useState<Group[] | null>(null); // every loose group, fetched up front
  useEffect(() => {
    let on = true;
    load(it).then((g) => { if (!on) return; setGroups(g); if (g.length === 0 && loadSimilar && !picked.current) setMode("recommended"); }); // collection / shared universe
    if (loadSimilar) loadSimilar(it).then((s) => on && setAll(s));
    return () => { on = false; };
  }, [it, load, loadSimilar]);
  const shown = !loadSimilar || mode === "franchise" ? groups : all && all.filter((g) => g.by === mode);
  useEffect(() => {
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const unlock = lockScroll();
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); unlock(); };
  }, [onClose]);
  return (
    <div className="fsheet-wrap" onClick={onClose}>
      <div className="fsheet" role="dialog" aria-modal="true" aria-label={`Related to ${it.title}`} onClick={(e) => e.stopPropagation()}>
        <div className="fsheet-top">
          <div style={{ minWidth: 0 }}>
            <div className="small muted">{loadSimilar ? `Related to ${it.title}, by ${MODES.find((m) => m[0] === mode)![1].toLowerCase()}.` : `You marked ${it.title}. Which of these have you seen?`}</div>
          </div>
          <button ref={close} type="button" className="btn sm gold" onClick={onClose}>Done</button>
        </div>
        {loadSimilar && (
          <div className="chips" role="group" aria-label="Find related titles by" style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
            {MODES.map(([m, label]) => (
              <button key={m} type="button" className={`btn sm${mode === m ? " gold" : ""}`} aria-pressed={mode === m} onClick={() => { picked.current = true; setMode(m); }}>{label}</button>
            ))}
          </div>
        )}
        {!shown ? <p className="muted"><span className="spin" />Finding related titles</p>
          : shown.length === 0 ? <p className="muted">{!loadSimilar ? "Nothing related found." : mode === "franchise" ? "No franchise or collection found for this title. Try another view." : "Nothing found this way. Try another view."}</p>
          : <FranchiseList groups={shown} include={!loadSimilar || mode === "franchise" ? it : undefined} onNavigate={() => { keepHistory(); onClose(); }} />}
      </div>
    </div>
  );
}
