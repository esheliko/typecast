"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { PersonLink } from "./Modal";
import { Avatar } from "./ui";
import { useLib } from "./cast/LibState";
import { Photo } from "./who/bits";
import { PositionPicker } from "./who/PositionControl";
import { whoApi } from "@/lib/who-client";
import { appearsLabel, matchWho, startPos, type Part } from "@/lib/who-search";
import { posLabel } from "@/lib/who-scope";
import type { WhoBrief } from "@/lib/who-data";
import type { Pos, WhoFace } from "@/lib/who-types";
import type { SearchHit } from "@/lib/types";

export interface WhoTitle { key: string; type: "movie" | "tv"; title: string; poster: string | null }

const Marked = ({ parts }: { parts: Part[] }) => <>{parts.map((p, i) => (p.hit ? <mark key={i} className="whs-mark">{p.t}</mark> : <span key={i}>{p.t}</span>))}</>;

/**
 * Search's "Who's that?" mode: pick a title (a Watching series first), where you are in it, and type a name or character you remember. The people come from the same
 * roster as the Watching now page, cut server-side at that place, so nobody from a later episode is ever listed. Nothing is saved; TMDB has no plot words, so only names and characters match.
 */
export default function WhoSearch({ watching }: { watching: WhoTitle[] }) {
  const { get } = useLib();
  const [sel, setSel] = useState<WhoTitle | null>(watching[0] ?? null);
  const [brief, setBrief] = useState<WhoBrief | null>(null);
  const [pos, setPos] = useState<Pos | null | undefined>(undefined); // undefined: not known yet; null: a film
  const [faces, setFaces] = useState<WhoFace[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [q, setQ] = useState("");
  const [tq, setTq] = useState("");
  const [hits, setHits] = useState<WhoTitle[] | null>(null);
  const getRef = useRef(get);
  getRef.current = get;

  // The title's facts (season list for the picker) and where to start.
  useEffect(() => {
    setBrief(null); setFaces(null); setPos(undefined);
    if (!sel) return;
    let live = true;
    setState("loading");
    whoApi.title(sel.key).then((n) => {
      if (!live) return;
      const m = getRef.current(sel.key);
      setBrief(n.brief);
      setPos(startPos(sel.type, m?.status, m?.progress, n.brief.seasons));
    }).catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [sel]);

  // Who is in the title up to that place (the server cuts it; later episodes are never in the answer).
  useEffect(() => {
    if (!sel || pos === undefined) return;
    let live = true;
    setState("loading");
    whoApi.roster(sel.key, pos).then((r) => { if (live) { setFaces(r.faces); setState("idle"); } }).catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [sel, pos]);

  // Another title to look in.
  useEffect(() => {
    const t = tq.trim();
    if (t.length < 2) { setHits(null); return; }
    let live = true;
    const h = setTimeout(() => {
      fetch(`/api/search?kind=title&q=${encodeURIComponent(t)}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j: { hits?: SearchHit[] }) => {
        if (live) setHits((j.hits ?? []).flatMap((x) => (x.kind === "title" ? [{ key: x.key, type: x.type, title: x.title, poster: x.poster }] : [])).slice(0, 6));
      }).catch(() => { if (live) setHits([]); });
    }, 250);
    return () => { live = false; clearTimeout(h); };
  }, [tq]);

  const matches = useMemo(() => (faces ? matchWho(faces, q) : []), [faces, q]);
  const term = q.trim();
  const choose = (t: WhoTitle) => { setSel(t); setTq(""); setHits(null); setQ(""); };
  const others = watching.filter((w) => w.key !== sel?.key);

  return (
    <div className="whs">
      <p className="muted whs-intro">Type a name or a character you remember from a series. Only people up to where you are show up.</p>
      <div className="whs-row">
        <span className="whs-l">Title</span>
        {sel
          ? <span className="whs-sel">{sel.poster && <Photo path={sel.poster} name={sel.title} w="w92" className="whs-poster" />}<b>{sel.title}</b></span>
          : <span className="muted">Pick a film or series</span>}
      </div>
      {others.length > 0 && (
        <div className="chips scroll" role="group" aria-label="Your Watching series">
          {others.map((w) => <button key={w.key} type="button" className="chip" onClick={() => choose(w)}>{w.title}</button>)}
        </div>
      )}
      <input type="search" className="whs-t" value={tq} onChange={(e) => setTq(e.target.value)} aria-label="Search for another film or series" placeholder="Another film or series…" autoComplete="off" />
      {hits && (hits.length === 0
        ? <p className="small muted">Nothing found.</p>
        : <ul className="whs-hits">{hits.map((h) => <li key={h.key}><button type="button" className="whs-hit" onClick={() => choose(h)}>{h.title}<span className="row-sub">{h.type === "tv" ? "Series" : "Film"}</span></button></li>)}</ul>)}

      {sel && brief && pos && sel.type === "tv" && (
        <div className="whs-row whs-pick">
          <span className="whs-l">Episode</span>
          <PositionPicker brief={brief} pos={pos} seasons={[...brief.seasons.filter((s) => s.n > 0), ...brief.seasons.filter((s) => s.n === 0)]} onChange={setPos} />
        </div>
      )}

      {sel && (
        <label className="whs-q">
          <span className="whs-l">A name or role you remember</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="A name or role you remember" placeholder="e.g. Brent, the sheriff" autoComplete="off" enterKeyHint="search" />
        </label>
      )}

      {state === "error" && <p className="small muted" role="alert">Couldn&rsquo;t load the cast just now. Try again in a moment.</p>}
      {state === "loading" && sel && <p className="muted"><span className="spin" aria-hidden="true" />Loading the cast…</p>}
      {faces && term.length >= 2 && (
        matches.length === 0
          ? <p className="muted" role="status">No one called &ldquo;{term}&rdquo; {sel?.type !== "tv" ? "in this film" : pos?.s == null ? "in this series" : `up to ${posLabel(pos)}`}. Try part of the name or the character.</p>
          : (
            <ul className="whs-list" aria-label="Matching cast">
              {matches.map((m) => (
                <li key={m.face.id}>
                  <PersonLink className="whs-person" pid={m.face.id} it={{ name: m.face.name, photo: m.face.photo }}>
                    <Avatar photo={m.face.photo} name={m.face.name} />
                    <span className="whs-text">
                      <span className="nm"><Marked parts={m.name} /></span>
                      {m.role && <span className="row-sub">as <Marked parts={m.roleParts} /></span>}
                    </span>
                    {appearsLabel(m.face) && <span className="whs-n">{appearsLabel(m.face)}</span>}
                  </PersonLink>
                </li>
              ))}
            </ul>
          )
      )}
    </div>
  );
}
