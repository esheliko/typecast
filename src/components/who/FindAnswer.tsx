"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PersonLink, TitleLink } from "../Modal";
import { Avatar } from "../ui";
import { Photo } from "./bits";
import type { PCredit } from "@/lib/who-types";

export interface ActorFind {
  person: { id: number; name: string; photo: string | null } | null; matches: { credit: PCredit; role: string; by: string }[];
  /** A title was found instead of an actor ("hunger games haymitch"): its cast that matches. */
  title?: { key: string; type: "movie" | "tv"; title: string; year: string; poster: string | null }; people?: { id: number; name: string; photo: string | null; role: string; why?: string; show?: string }[]; episodes?: { s: number; e: number; name: string }[];
  /** Only a name or a title, nothing left to match: the plain answer a normal search already gives. */
  plain?: boolean;
}

/** "Who's that?" with no title chosen: asks /api/who/find once the typing pauses. `off` (or text shorter than `min` chars) clears it. */
export function useActorFind(text: string, off = false, min = 3): { actor: ActorFind | null; finding: boolean } {
  const [actor, setActor] = useState<ActorFind | null>(null);
  const [finding, setFinding] = useState(false);
  const t = text.trim();
  useEffect(() => {
    if (off || t.length < min) { setActor(null); setFinding(false); return; }
    let live = true;
    setFinding(true); // shown straight away, also while waiting for the typing to pause
    const h = setTimeout(() => {
      fetch(`/api/who/find?q=${encodeURIComponent(t)}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j: ActorFind) => { if (live) { setActor(j); setFinding(false); } }).catch(() => { if (live) { setActor({ person: null, matches: [] }); setFinding(false); } });
    }, 300);
    return () => { live = false; clearTimeout(h); };
  }, [t, off, min]);
  return { actor, finding };
}

/** What /api/who/find found: a title's cast or episodes, or an actor's matching roles. */
export function FindAnswer({ actor, term }: { actor: ActorFind; term: string }) {
  if (actor.title || actor.people?.length) {
    return (
      <>
        {actor.title && (
          <TitleLink k={actor.title.key} className="whs-person" it={{ title: actor.title.title, year: actor.title.year, poster: actor.title.poster }}>
            {actor.title.poster && <Photo path={actor.title.poster} name={actor.title.title} w="w92" className="whs-poster" />}
            <span className="whs-text"><span className="nm">{actor.title.title}</span><span className="row-sub">{actor.title.type === "tv" ? "Series" : "Film"} · {actor.title.year}</span></span>
          </TitleLink>
        )}
        {actor.episodes?.length
          ? (
            <ul className="whs-list" aria-label="Matching episodes">
              {actor.episodes.map((e) => (
                <li key={`${e.s}-${e.e}`}>
                  <Link className="whs-person" href={`/watching?k=${actor.title!.key.replace(":", "-")}&s=${e.s}&e=${e.e}`}>
                    <span className="whs-text"><span className="nm">{e.name}</span><span className="row-sub">Season {e.s} · Episode {e.e}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )
          : !actor.people?.length
          ? <p className="muted" role="status">No one in the cast matches that. Try part of the character or the actor&rsquo;s name.</p>
          : (
            <ul className="whs-list" aria-label="Matching cast">
              {actor.people.map((m) => (
                <li key={m.id}>
                  <PersonLink className="whs-person" pid={m.id} it={{ name: m.name, photo: m.photo }}>
                    <Avatar photo={m.photo} name={m.name} />
                    <span className="whs-text"><span className="nm">{m.name}</span>{(m.role || m.why) && <span className="row-sub">{[m.role && `as ${m.role}`, m.why, m.show].filter(Boolean).join(" · ")}</span>}</span>
                  </PersonLink>
                </li>
              ))}
            </ul>
          )}
      </>
    );
  }
  if (!actor.person) return <p className="muted" role="status">Couldn&rsquo;t tell who that is. Try the actor&rsquo;s name with a character or title, or a title with a character.</p>;
  return (
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
  );
}
