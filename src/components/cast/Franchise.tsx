"use client";
import { TitleLink } from "../Modal";
import { GlimpseButton } from "../Glimpse";
import { titleSpec } from "@/lib/glimpse";
import { useEffect, useRef, useState } from "react";
import { useLib } from "./LibState";
import QuickMark from "./QuickMark";
import { img, typeLabel } from "@/lib/img";
import type { Item } from "@/lib/types";

/** Titles that belong together (a collection, a shared universe), in release order. */
export interface Group { label: string; items: Item[] }

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
  return (
    <div className="fr">
      {groups.map((g) => {
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
                    <TitleLink className="fr-main" k={it.key} onClick={onNavigate}>
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
export function FranchiseSheet({ it, load, onClose }: { it: Item; load: (it: Item) => Promise<Group[]>; onClose: () => void }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { let on = true; load(it).then((g) => on && setGroups(g)); return () => { on = false; }; }, [it, load]);
  useEffect(() => {
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fsheet-wrap" onClick={onClose}>
      <div className="fsheet" role="dialog" aria-modal="true" aria-label={`Related to ${it.title}`} onClick={(e) => e.stopPropagation()}>
        <div className="fsheet-top">
          <div style={{ minWidth: 0 }}>
            <div className="small muted">You marked {it.title}. Which of these have you seen?</div>
          </div>
          <button ref={close} type="button" className="btn sm gold" onClick={onClose}>Done</button>
        </div>
        {!groups ? <p className="muted"><span className="spin" />Finding related titles</p>
          : groups.length === 0 ? <p className="muted">Nothing related found.</p>
          : <FranchiseList groups={groups} include={it} onNavigate={onClose} />}
      </div>
    </div>
  );
}
