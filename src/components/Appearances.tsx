"use client";
import { useEffect, useRef, useState } from "react";
import { appearanceLine, epCode, fmtDate } from "@/lib/episodes";
import { SpoilerGate } from "./SpoilerGate";
import type { Appearances as Data } from "@/lib/types";

/** Asks the Episodes section of this page to open one episode (and scroll to it). */
function openEpisode(s: number, e: number) {
  window.dispatchEvent(new CustomEvent("tc:episode", { detail: { s, e } }));
}

// An answer held back by a spoiler line (the saved place moves as you tick episodes, and this component does not know it) is kept 15 seconds; the rest for the session.
const cache = new Map<string, { t: number; p: Promise<Data>; v?: Data }>();
function load(tv: number, credits: string[], eps: number, reveal: boolean): Promise<Data> {
  const k = `${tv}:${credits.join(",")}${reveal ? ":!" : ""}`;
  const hit = cache.get(k);
  if (hit && (!hit.v?.hidden || Date.now() - hit.t < 15_000)) return hit.p;
  const q = new URLSearchParams({ tv: String(tv), c: credits.join(","), n: String(eps) });
  if (reveal) q.set("reveal", "1");
  const p = fetch(`/api/appearances?${q}`).then(async (r) => {
    if (!r.ok) throw new Error("lookup failed");
    return r.json() as Promise<Data>;
  });
  const entry: { t: number; p: Promise<Data>; v?: Data } = { t: Date.now(), p };
  p.then((v) => { entry.v = v; }, () => { if (cache.get(k) === entry) cache.delete(k); });
  cache.set(k, entry);
  return p;
}

const SHOW = 8;

/**
 * Which episodes of this series someone was in, when they aired and as whom. Loads when the row it sits in is opened
 * (or at once with `auto`). Each episode jumps to it in the Episodes section. Fails soft: a lookup error shows nothing.
 */
export default function Appearances({ tv, credits, eps, auto, show }: { tv: number; credits: string[]; eps?: number; auto?: boolean; /** The series' name, for the spoiler gate. */ show?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [want, setWant] = useState(!!auto);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [all, setAll] = useState(false);
  // "Show" on a spoiler gate: this view only (per mounted list), nothing is saved.
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    if (want) return;
    const d = box.current?.closest("details");
    if (!d) { setWant(true); return; }
    const on = () => { if (d.open) setWant(true); };
    on();
    d.addEventListener("toggle", on);
    return () => d.removeEventListener("toggle", on);
  }, [want]);

  const ck = credits.join(",");
  useEffect(() => {
    if (!want || !ck) return;
    let live = true;
    load(tv, ck.split(","), eps ?? 0, reveal).then((x) => { if (live) setData(x); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [want, tv, ck, eps, reveal]);

  if (!credits.length || failed) return <div ref={box} hidden />;
  const roles = data?.roles.filter((r) => r.role) ?? [];
  const list = data ? (all ? data.episodes : data.episodes.slice(0, SHOW)) : [];
  return (
    <div ref={box} className="apps">
      <div className="apps-head">In this series</div>
      {!data ? <span className="muted small"><span className="spin" />Finding their episodes</span> : (
        <>
          <div className="apps-line">{appearanceLine(data) || (data.hidden ? "" : "Episodes not listed")}</div>
          {roles.length > 1 && <div className="small muted">As {roles.map((r) => (r.eps ? `${r.role} (${r.eps})` : r.role)).join(", ")}</div>}
          {list.length > 0 && (
            <ul className="apps-eps">
              {list.map((x) => (
                <li key={`${x.s}:${x.e}`}>
                  <button type="button" className="apps-ep" onClick={() => openEpisode(x.s, x.e)}>
                    <span className="ep-code">{epCode(x.s, x.e)}</span>
                    <span className="apps-name">{x.name}</span>
                    <span className="apps-date">{fmtDate(x.air)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data.hidden && <SpoilerGate title={show ?? "this series"} hidden={data.hidden} what="later episodes" hintKey={`tv:${tv}`} placeHref={`/watching?k=tv-${tv}`} onShow={() => { setData(null); setReveal(true); }} />}
          {!all && data.episodes.length > SHOW && <button type="button" className="btn sm" style={{ marginTop: 6 }} onClick={() => setAll(true)}>All {data.episodes.length} episodes</button>}
        </>
      )}
    </div>
  );
}

/** A line that opens one episode in the Episodes section ("Next: S3 E4 …"). */
export function EpisodeJump({ s, e, children, className }: { s: number; e: number; children: React.ReactNode; className?: string }) {
  return <button type="button" className={className ?? "ep-jump"} onClick={() => openEpisode(s, e)}>{children}</button>;
}
