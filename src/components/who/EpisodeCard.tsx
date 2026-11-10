"use client";
import { useEffect, useState } from "react";
import { Sk, Soft, ZoomBtn } from "./bits";
import { useWho } from "./WhoContext";
import { img } from "@/lib/img";
import { fmtDay } from "@/lib/who-dates";
import { whoApi } from "@/lib/who-client";
import { posCode } from "@/lib/who-scope";
import type { WhoEpDetail } from "@/lib/who-data";

/** One episode as a card: its still (press to enlarge), title, air date, who made it, and the summary behind a button. Loads its own details. */
export function EpisodeCard({ s, e }: { s: number; e: number }) {
  const { brief } = useWho();
  const [ep, setEp] = useState<WhoEpDetail | null | undefined>(undefined);
  const [summary, setSummary] = useState(false);
  useEffect(() => {
    let live = true;
    setEp(undefined); setSummary(false);
    whoApi.season(brief.id, s, e).then((r) => { if (live) setEp(r.detail); }).catch(() => { if (live) setEp(null); });
    return () => { live = false; };
  }, [brief.id, s, e]);
  const code = posCode({ s, e });
  if (ep === undefined) return <div className="wx-epcard" aria-hidden="true"><span className="sk-b wx-epstill" /><span style={{ flex: 1 }}><Sk w="60%" h={18} /><Sk w="40%" h={12} style={{ marginTop: 8 }} /><Sk w="70%" h={12} style={{ marginTop: 8 }} /></span></div>;
  if (ep === null) return <Soft>TMDB has no details for {code}.</Soft>;
  return (
    <div className="wx-epcard">
      {ep.still
        // eslint-disable-next-line @next/next/no-img-element
        ? <ZoomBtn path={ep.still} name={`${code} ${ep.name}`} size="original" className="wx-epstillb"><img className="wx-epstill" src={img(ep.still, "w300")} alt="" loading="lazy" /></ZoomBtn>
        : <span className="wx-epstill wx-noph" aria-hidden="true" />}
      <div className="wx-epinfo">
        <span className="mc-label">{code}</span>
        <h3 className="wx-eptitle">{ep.name || `Episode ${ep.e}`}</h3>
        <p className="small muted" style={{ margin: "2px 0 6px" }}>{[ep.air && `Aired ${fmtDay(ep.air)}`, ep.runtime && `${ep.runtime} min`].filter(Boolean).join(" · ")}</p>
        {ep.directors.length > 0 && <p className="small" style={{ margin: "0 0 2px" }}><span className="muted">Directed by</span> {ep.directors.join(", ")}</p>}
        {ep.writers.length > 0 && <p className="small" style={{ margin: 0 }}><span className="muted">Written by</span> {ep.writers.join(", ")}</p>}
        {ep.overview && (
          <>
            <button type="button" className="chip wx-sumb" aria-expanded={summary} onClick={() => setSummary((v) => !v)}>{summary ? "Hide summary" : "Show summary"}</button>
            {summary && <p className="wx-summary">{ep.overview}</p>}
          </>
        )}
      </div>
    </div>
  );
}
