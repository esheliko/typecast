"use client";
import { nodeId, useWho, type Node } from "./WhoContext";
import { EpisodeCard } from "./EpisodeCard";
import { posCode } from "@/lib/who-scope";

type ENode = Extract<Node, { t: "episode" }>;

/** An episode opened from a person's episode list. It is only looked at: where you are stays where it was, unless you say so. */
export function EpisodeNode({ node }: { node: ENode }) {
  const { brief, pos, setExact } = useWho();
  const here = pos?.s === node.s && pos?.e === node.e;
  const code = posCode(node);
  return (
    <div className="wx-node" data-node={nodeId(node)}>
      <header className="wx-thead">
        <div className="wx-pmeta">
          <h2 className="wx-pname" tabIndex={-1} data-focus-target>{brief.title} {code}</h2>
          <p className="small muted" style={{ margin: "4px 0 0" }}>{here ? "This is where you are." : "Just looking: this does not change where you are."}</p>
        </div>
      </header>
      <section className="wx-sec" aria-label="Episode"><EpisodeCard s={node.s} e={node.e} /></section>
      {!here && <button type="button" className="chip wx-sumb" onClick={() => setExact(node.s, node.e)}>Set {code} as where I am</button>}
    </div>
  );
}
