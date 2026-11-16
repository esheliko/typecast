"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { PersonLink, TitleLink } from "./Modal";
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
import type { PCredit } from "@/lib/who-types";

interface ActorFind {
  person: { id: number; name: string; photo: string | null } | null; matches: { credit: PCredit; role: string; by: string }[];
  /** A title was found instead of an actor ("hunger games haymitch"): its cast that matches. */
  title?: { key: string; type: "movie" | "tv"; title: string; year: string; poster: string | null }; people?: { id: number; name: string; photo: string | null; role: string }[];
}

export interface WhoTitle { key: string; type: "movie" | "tv"; title: string; poster: string | null }

const Marked = ({ parts }: { parts: Part[] }) => <>{parts.map((p, i) => (p.hit ? <mark key={i} className="whs-mark">{p.t}</mark> : <span key={i}>{p.t}</span>))}</>;

/**
 * Search's "Who's that?" mode: pick a title (a Watching series first), where you are in it, and type a name or character you remember. The people come from the same
 * roster as the Watching now page, cut server-side at that place, so nobody from a later episode is ever listed. Nothing is saved; TMDB has no plot words, so only names and characters match.
 */
export default function WhoSearch({ watching }: { watching: WhoTitle[] }) {
  const { get } = useLib();
  const [sel, setSel] = useState<WhoTitle | null>(null);
  const [brief, setBrief] = useState<WhoBrief | null>(null);
  const [pos, setPos] = useState<Pos | null | undefined>(undefined); // undefined: not known yet; null: a film
  const [faces, setFaces] = useState<WhoFace[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [q, setQ] = useState("");
  const [tq, setTq] = useState("");
  const [hits, setHits] = useState<WhoTitle[] | null>(null);
  const [changing, setChanging] = useState(false);
  const [actor, setActor] = useState<ActorFind | null>(null);
  const [finding, setFinding] = useState(false);
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

  // No title chosen: the text is an actor and a part or title ("george clooney as criminal").
  useEffect(() => {
    const t = q.trim();
    if (sel || t.length < 3) { setActor(null); setFinding(false); return; }
    let live = true;
    setFinding(true); // shown straight away, also while waiting for the typing to pause
    const h = setTimeout(() => {
      fetch(`/api/who/find?q=${encodeURIComponent(t)}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j: ActorFind) => { if (live) { setActor(j); setFinding(false); } }).catch(() => { if (live) { setActor({ person: null, matches: [] }); setFinding(false); } });
    }, 300);
    return () => { live = false; clearTimeout(h); };
  }, [q, sel]);

  const matches = useMemo(() => (faces ? matchWho(faces, q) : []), [faces, q]);
  const term = q.trim();
  const pick = changing || !sel;
  const choose = (t: WhoTitle) => { setChanging(false); setSel(t); setTq(""); setHits(null); setQ(""); };
  const others = watching.filter((w) => w.key !== sel?.key);

  return (
    <div className="whs" data-no-lift>
      <div className="whs-row whs-top">
        <button type="button" className="whs-sel" aria-expanded={pick} onClick={() => setChanging((v) => !v)}>
          {sel
            ? <>{sel.poster && <Photo path={sel.poster} name={sel.title} w="w92" className="whs-poster" />}<b>{sel.title}</b></>
            : <span className="muted">Pick a film or series</span>}
          <span className="whs-chg">{pick ? "Close" : "Change"}</span>
        </button>
        {sel && brief && pos && sel.type === "tv" && (
          <PositionPicker brief={brief} pos={pos} seasons={[...brief.seasons.filter((s) => s.n > 0), ...brief.seasons.filter((s) => s.n === 0)]} onChange={setPos} />
        )}
      </div>

      <input type="search" className="whs-t" value={q} onChange={(e) => setQ(e.target.value)} aria-label="A name or role you remember"
        placeholder={sel ? "A name or role, e.g. Brent, the sheriff" : "An actor and a part, e.g. Marlon Brando Corleone"} autoComplete="off" enterKeyHint="search" />
      {!sel && finding && term.length >= 3 && <p className="muted" role="status" aria-live="polite"><span className="spin" aria-hidden="true" />Looking for &ldquo;{term}&rdquo;…</p>}
      {!sel && !finding && actor && term.length >= 3 && (
        actor.title
          ? (
            <>
              <TitleLink k={actor.title.key} className="whs-person" it={{ title: actor.title.title, year: actor.title.year, poster: actor.title.poster }}>
                {actor.title.poster && <Photo path={actor.title.poster} name={actor.title.title} w="w92" className="whs-poster" />}
                <span className="whs-text"><span className="nm">{actor.title.title}</span><span className="row-sub">{actor.title.type === "tv" ? "Series" : "Film"} · {actor.title.year}</span></span>
              </TitleLink>
              {!actor.people?.length
                ? <p className="muted" role="status">No one in the cast matches that. Try part of the character or the actor&rsquo;s name.</p>
                : (
                  <ul className="whs-list" aria-label="Matching cast">
                    {actor.people.map((m) => (
                      <li key={m.id}>
                        <PersonLink className="whs-person" pid={m.id} it={{ name: m.name, photo: m.photo }}>
                          <Avatar photo={m.photo} name={m.name} />
                          <span className="whs-text"><span className="nm">{m.name}</span>{m.role && <span className="row-sub">as {m.role}</span>}</span>
                        </PersonLink>
                      </li>
                    ))}
                  </ul>
                )}
            </>
          )
        : !actor.person
          ? <p className="muted" role="status">Couldn&rsquo;t tell who that is. Try the actor&rsquo;s name with a character or title, or a title with a character.</p>
          : (
            <>
              <PersonLink className="whs-person" pid={actor.person.id} it={{ name: actor.person.name, photo: actor.person.photo }}>
                <Avatar photo={actor.person.photo} name={actor.person.name} /><span className="whs-text"><span className="nm">{actor.person.name}</span></span>
              </PersonLink>
              {actor.matches.length === 0
                ? <p className="muted" role="status">Nothing of theirs matches that. TMDB lists character names, so try the name of the part.</p>
                : (
                  <ul className="whs-list" aria-label="Matching roles">
                    {actor.matches.map((m) => (
                      <li key={m.credit.key}>
                        <TitleLink k={m.credit.key} className="whs-person" it={{ title: m.credit.title, year: m.credit.year, poster: m.credit.poster }}>
                          {m.credit.poster && <Photo path={m.credit.poster} name={m.credit.title} w="w92" className="whs-poster" />}
                          <span className="whs-text"><span className="nm">{m.credit.title}</span>{m.by === "theme" ? <span className="row-sub">{m.role ? `as ${m.role} · ` : ""}the story fits &ldquo;{term}&rdquo;</span> : m.role && <span className="row-sub">as {m.role}</span>}</span>
                          <span className="whs-n">{m.credit.year}</span>
                        </TitleLink>
                      </li>
                    ))}
                  </ul>
                )}
            </>
          )
      )}

      {pick && (
        <div className="whs-change">
          {others.length > 0 && (
            <div className="chips scroll" role="group" aria-label="Your Watching series">
              {others.map((w) => <button key={w.key} type="button" className="chip" onClick={() => choose(w)}>{w.title}</button>)}
            </div>
          )}
          <input type="search" className="whs-t" value={tq} onChange={(e) => setTq(e.target.value)} aria-label="Search for another film or series" placeholder="Another film or series…" autoComplete="off" />
          {hits && (hits.length === 0
            ? <p className="small muted">Nothing found.</p>
            : <ul className="whs-hits">{hits.map((h) => <li key={h.key}><button type="button" className="whs-hit" onClick={() => choose(h)}>{h.title}<span className="row-sub">{h.type === "tv" ? "Series" : "Film"}</span></button></li>)}</ul>)}
        </div>
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
