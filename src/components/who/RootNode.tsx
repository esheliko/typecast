"use client";
import { useEffect, useState } from "react";
import { FactView } from "../Watching";
import { Section, Sk, Soft } from "./bits";
import { useWho } from "./WhoContext";
import { img } from "@/lib/img";
import { fmtDay } from "@/lib/who-dates";
import { whoApi } from "@/lib/who-client";
import { factButtons } from "@/lib/watching";
import { posLabel, scopeKind, urlKey } from "@/lib/who-scope";
import type { Answer } from "@/lib/answer";
import type { WhoEpDetail } from "@/lib/who-data";

const SPOIL_KEY = "typecast.ask.spoilers";
const safe = <T,>(f: () => T, d: T): T => { try { return f(); } catch { return d; } };

/** "This title": the episode (or film) you are on, then the facts as tappable cards that open in place. There is no question box. */
export function RootNode() {
  const { brief, pos } = useWho();
  const tv = brief.type === "tv";
  const exact = tv && scopeKind(pos) === "exact";
  const [ep, setEp] = useState<WhoEpDetail | null | undefined>(undefined);
  const [summary, setSummary] = useState(false);
  useEffect(() => {
    setSummary(false);
    if (!exact || !pos || pos.s == null || pos.e == null) { setEp(undefined); return; }
    let live = true;
    setEp(undefined);
    whoApi.season(brief.id, pos.s, pos.e).then((r) => { if (live) setEp(r.detail); }).catch(() => { if (live) setEp(null); });
    return () => { live = false; };
  }, [brief.id, exact, pos]);

  const [spoilers, setSpoilers] = useState(() => safe(() => localStorage.getItem(SPOIL_KEY) === "1", false));
  const [facts, setFacts] = useState<Record<string, Answer | "loading">>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { setFacts({}); setOpen({}); }, [brief.key, pos?.s, pos?.e, spoilers]);
  const toggleSpoilers = () => { const v = !spoilers; setSpoilers(v); safe(() => localStorage.setItem(SPOIL_KEY, v ? "1" : "0"), undefined); };
  const ask = async (label: string, q: string) => {
    const isOpen = !!open[label];
    setOpen((o) => ({ ...o, [label]: !isOpen }));
    if (isOpen || facts[label]) return;
    setFacts((f) => ({ ...f, [label]: "loading" }));
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q, spoilers, k: urlKey(brief.key), s: pos?.s ?? undefined, e: pos?.e ?? undefined }) });
      const j = await r.json().catch(() => ({}));
      setFacts((f) => ({ ...f, [label]: r.ok && typeof j.text === "string" ? j : { text: j.error ?? `Couldn't look that up (${r.status}). Try again.` } }));
    } catch { setFacts((f) => ({ ...f, [label]: { text: "Couldn't reach Typecast. Check your connection." } })); }
  };
  const buttons = factButtons(brief.type).filter((b) => exact || !["Episodes left", "This episode"].includes(b.label));

  return (
    <div className="wx-node" data-node="root">
      <header className="wx-thead">
        <h2 className="wx-pname" tabIndex={-1} data-focus-target>{brief.title}</h2>
      </header>

      <Section title={tv ? (exact ? "This episode" : "Where you are") : "This film"}>
        {tv && exact && ep === undefined && <div className="wx-epcard" aria-hidden="true"><span className="sk-b wx-epstill" /><span style={{ flex: 1 }}><Sk w="60%" h={18} /><Sk w="40%" h={12} style={{ marginTop: 8 }} /><Sk w="70%" h={12} style={{ marginTop: 8 }} /></span></div>}
        {tv && exact && ep === null && <Soft>TMDB has no details for {posLabel(pos)}.</Soft>}
        {tv && exact && ep && (
          <div className="wx-epcard">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {ep.still ? <img className="wx-epstill" src={img(ep.still, "w300")} alt="" loading="lazy" /> : <span className="wx-epstill wx-noph" aria-hidden="true" />}
            <div className="wx-epinfo">
              <span className="mc-label">{posLabel(pos)}</span>
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
        )}
        {tv && !exact && <p className="small" style={{ margin: 0 }}>{pos?.s == null ? "The season is not set." : `${posLabel(pos)}: the episode is not set.`} Pick an episode above, or tap &ldquo;We&rsquo;re on this one&rdquo; on a person&rsquo;s episode.</p>}
        {!tv && (
          <div className="wx-epcard">
            <div className="wx-epinfo">
              <p className="small muted" style={{ margin: "0 0 6px" }}>{[brief.first && `Released ${fmtDay(brief.first)}`, brief.runtime && `${brief.runtime} min`, brief.genres.slice(0, 3).join(", ")].filter(Boolean).join(" · ")}</p>
              {brief.overview && (
                <>
                  <button type="button" className="chip wx-sumb" aria-expanded={summary} onClick={() => setSummary((v) => !v)}>{summary ? "Hide summary" : "Show summary"}</button>
                  {summary && <p className="wx-summary">{brief.overview}</p>}
                </>
              )}
            </div>
          </div>
        )}
      </Section>

      <Section title="About this title" note={<>Tap a card to open it. <button type="button" className="chip wx-spoil" aria-pressed={spoilers} onClick={toggleSpoilers}>{spoilers ? "Spoilers OK" : "No spoilers"}</button></>}>
        <ul className="wx-facts">
          {buttons.map((b) => {
            const isOpen = !!open[b.label], f = facts[b.label];
            return (
              <li key={b.label} className={`wx-fact${isOpen ? " open" : ""}`}>
                <button type="button" className="wx-factb" aria-expanded={isOpen} onClick={() => ask(b.label, b.q)}>
                  <span>{b.label}</span><span aria-hidden="true" className="wx-caret">{isOpen ? "▴" : "▾"}</span>
                </button>
                {isOpen && (
                  <div className="wx-factbody" aria-live="polite">
                    {f === "loading" || !f ? <div aria-hidden="true"><Sk w="90%" h={13} /><Sk w="70%" h={13} style={{ marginTop: 8 }} /></div> : <FactView a={f} onLeave={() => {}} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
