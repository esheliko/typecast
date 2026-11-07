"use client";
import { useState } from "react";
import { setProgress } from "@/app/actions";
import { CreditRow } from "./CreditRow";
import type { EnrichedMember, MediaType } from "@/lib/types";

interface Result { name: string; guests: EnrichedMember[]; cast: EnrichedMember[]; libKeys: Record<string, string> }

export default function EpisodeCast({ tvId, seasons, initial, inLibrary }: { tvId: number; seasons: { n: number; eps: number }[]; initial: { s: number; e: number }; inLibrary: boolean }) {
  const [s, setS] = useState(initial.s);
  const [e, setE] = useState(initial.e);
  const [res, setRes] = useState<Result | null>(null);
  const [state, setState] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState("");
  const maxEp = seasons.find((x) => x.n === s)?.eps;

  async function go(ev: React.FormEvent) {
    ev.preventDefault();
    if (!e || e < 1) return;
    setState("loading"); setError(""); setRes(null);
    try {
      const r = await fetch(`/api/episode?tv=${tvId}&s=${s}&e=${e}`);
      const j = await r.json();
      if (!r.ok) throw new Error(r.status === 404 ? "That episode is not on TMDB." : j.error ?? "Lookup failed.");
      setRes(j);
      if (inLibrary) await setProgress("tv" as MediaType, tvId, s, e);
    } catch (er) { setError((er as Error).message); }
    setState("idle");
  }
  const all = res ? [...res.guests, ...res.cast.filter((c) => !res.guests.some((g) => g.id === c.id))] : [];
  return (
    <form className="card pad" onSubmit={go}>
      <div className="inline">
        <label className="l" htmlFor="ep-s" style={{ margin: 0 }}>Season</label>
        <select id="ep-s" value={s} onChange={(x) => setS(+x.target.value)}>{seasons.map((x) => <option key={x.n} value={x.n}>{x.n}</option>)}</select>
        <label className="l" htmlFor="ep-e" style={{ margin: 0 }}>Episode</label>
        <input id="ep-e" type="number" min={1} max={maxEp} value={e || ""} onChange={(x) => setE(+x.target.value)} inputMode="numeric" />
        <button className="btn gold" type="submit" disabled={state === "loading"}>Show cast</button>
      </div>
      <div style={{ marginTop: 12 }}>
        {state === "loading" && <span className="muted"><span className="spin" />Loading</span>}
        {error && <span className="err">{error}</span>}
        {res && (
          <>
            <div className="row-title" style={{ fontSize: 18 }}>{res.name}</div>
            {inLibrary && <div className="small muted">Progress saved: S{s} E{e}</div>}
            {res.guests.length > 0 && <div className="mono small muted" style={{ margin: "10px 0 0" }}>GUEST STARS FIRST</div>}
            <ul className="credits">{all.map((c) => <CreditRow key={c.id} c={c} libKeys={res.libKeys} />)}</ul>
            {all.length === 0 && <p className="muted small">No cast listed for this episode.</p>}
          </>
        )}
      </div>
    </form>
  );
}
