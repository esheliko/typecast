"use client";
import { useEffect, useState } from "react";
import { PersonLink } from "./Modal";
import { Avatar } from "./ui";
import type { CastMember } from "@/lib/types";

/** A series' cast changes every season: pick a season to see who was in it. Fails soft (shows a small note). */
export default function SeasonCast({ tv, seasons }: { tv: number; seasons: number[] }) {
  const [s, setS] = useState(seasons[0]);
  const [cache, setCache] = useState<Record<number, CastMember[] | "err">>({});
  const have = cache[s];
  useEffect(() => {
    if (have) return;
    let live = true;
    fetch(`/api/season-cast?tv=${tv}&s=${s}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: CastMember[]) => live && setCache((c) => ({ ...c, [s]: d })))
      .catch(() => live && setCache((c) => ({ ...c, [s]: "err" })));
    return () => { live = false; };
  }, [tv, s, have]);
  const list = Array.isArray(have) ? have : null;
  return (
    <details className="cw" style={{ marginTop: 18 }}>
      <summary>Cast by season<span className="cw-n">{seasons.length}</span></summary>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0 10px" }} role="group" aria-label="Season">
        {seasons.map((n) => (
          <button key={n} type="button" className={`btn sm${n === s ? " primary" : ""}`} aria-pressed={n === s} onClick={() => setS(n)}>Season {n}</button>
        ))}
      </div>
      {have === "err" ? <p className="muted small">Could not load this season&apos;s cast.</p>
        : !list ? <p className="muted small"><span className="spin" />Loading season {s} cast</p>
        : list.length === 0 ? <p className="muted small">No cast listed for this season.</p>
        : (
          <div className="card pad"><ul className="credits">
            {list.map((c) => (
              <li key={c.id} className="credit">
                <PersonLink className="credit-main" pid={c.id} it={c}>
                  <Avatar photo={c.photo} name={c.name} />
                  <span className="credit-line"><span className="nm">{c.name}</span><span className="dots" /><span className="role">{c.role}{c.eps ? <span className="eps">{c.role ? " · " : ""}{c.eps} ep{c.eps === 1 ? "" : "s"}</span> : null}</span></span>
                </PersonLink>
              </li>
            ))}
          </ul></div>
        )}
    </details>
  );
}
