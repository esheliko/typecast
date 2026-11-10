"use client";
import { useEffect, useRef, useState } from "react";
import { Photo } from "./bits";
import { nodeId, nodeLabel, useWho, type Node } from "./WhoContext";
import { img } from "@/lib/img";
import { whoApi } from "@/lib/who-client";
import { breadcrumb, type RecentTrail } from "@/lib/who-trail";

/** The small round picture of a node: a face, a poster, an episode still, two faces for a pair. Always the same size, so nothing shifts. */
export function NodePic({ node, size = "w92" }: { node: Node; size?: string }) {
  const { brief } = useWho();
  const [still, setStill] = useState<string | null>(null);
  const sn = node.t === "episode" ? node.s : null, en = node.t === "episode" ? node.e : null;
  useEffect(() => {
    if (sn == null || en == null) return;
    let live = true;
    whoApi.season(brief.id, sn).then((r) => { if (live) setStill(r.episodes.find((x) => x.e === en)?.still ?? null); }).catch(() => {});
    return () => { live = false; };
  }, [brief.id, sn, en]);
  if (node.t === "person") return <Photo path={node.photo} name={node.name} w={size} className="wx-pic" />;
  if (node.t === "title") return <Photo path={node.poster} name={node.title} w={size} className="wx-pic" />;
  if (node.t === "episode" && still) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="wx-pic" src={img(still, "w185")} alt="" loading="lazy" decoding="async" />;
  }
  if (node.t === "episode") return <Photo path={brief.poster} name={brief.title} w={size} className="wx-pic" />;
  if (node.t === "pair") return <span className="wx-pic wx-pair2" aria-hidden="true"><Photo path={node.a.photo} name={node.a.name} w={size} className="wx-pic wx-pa" /><Photo path={node.b.photo} name={node.b.name} w={size} className="wx-pic wx-pb" /></span>;
  return <Photo path={brief.poster} name={brief.title} w={size} className="wx-pic" />;
}

/**
 * The trail: root first, then every step. A step is a fixed-size chip (round picture + one short line) whose width never changes,
 * so choosing one does not move the others. Steps after the one showing stay (dimmed) until a new step is chosen from an earlier one.
 */
export function Trail({ nodes, cur, onJump }: { nodes: Node[]; cur: number; onJump: (i: number) => void }) {
  const { rootLabel } = useWho();
  const nav = useRef<HTMLElement>(null);
  const all: Node[] = [{ t: "root" }, ...nodes];
  // Keep the showing step inside the trail's own scroll (never scrolls anything else).
  useEffect(() => {
    const box = nav.current;
    const el = box?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!box || !el) return;
    const l = el.offsetLeft, r = l + el.offsetWidth;
    if (l < box.scrollLeft + 8) box.scrollLeft = Math.max(0, l - 8);
    else if (r > box.scrollLeft + box.clientWidth - 8) box.scrollLeft = r - box.clientWidth + 8;
  }, [cur, nodes.length]);
  return (
    <nav className="wx-trail" aria-label="Trail" ref={nav}>
      <ol>
        {all.map((n, i) => {
          const label = nodeLabel(n, rootLabel);
          return (
            <li key={`${i}-${nodeId(n)}`}>
              {i > 0 && <span className="wx-sep" aria-hidden="true">›</span>}
              <button type="button" className={`wx-tstep${i === cur ? " cur" : ""}${i > cur ? " ahead" : ""}`} aria-current={i === cur ? "step" : undefined} title={label} onClick={() => i !== cur && onJump(i)}>
                <NodePic node={n} /><span className="wx-tl">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** "Recently opened": one chip per line of history, small round pictures only; the whole breadcrumb is the tooltip. */
export function RecentRow({ recents, onRestore, onWarm }: { recents: RecentTrail[]; onRestore: (r: RecentTrail) => void; onWarm: (id: number) => void }) {
  if (!recents.length) return null;
  return (
    <div className="wx-recent" aria-label="Recently opened">
      <span className="mc-label">Recently opened</span>
      <div className="wx-recent-row">
        {recents.map((r) => {
          const bc = breadcrumb(r.nodes);
          const first = r.nodes.find((n) => n.t === "person");
          return (
            <button key={r.id} type="button" className="wx-rchip" title={bc} aria-label={`Reopen ${bc}`} onClick={() => onRestore(r)} onMouseEnter={() => first?.t === "person" && onWarm(first.id)}>
              {r.nodes.map((n, i) => <NodePic key={`${i}-${nodeId(n)}`} node={n} />)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Phones: the way back to the details after closing them. Shows the step you were on, so it also resumes where you left off. */
export function Dock({ node, onOpen }: { node: Node; onOpen: () => void }) {
  const { rootLabel } = useWho();
  const label = nodeLabel(node, rootLabel);
  return (
    <button type="button" className="wx-dock" onClick={onOpen} aria-label={`Open details: ${label}`}>
      <NodePic node={node} /><span className="wx-dockt"><span className="small muted">Details</span><b>{label}</b></span><span className="wx-dockgo" aria-hidden="true">▴</span>
    </button>
  );
}
