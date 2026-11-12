"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useLib } from "../cast/LibState";
import { FactView, useWatchControl } from "../Watching";
import { EpisodeCard } from "./EpisodeCard";
import { Section, Sk, ZoomBtn, Photo } from "./bits";
import { useWho } from "./WhoContext";
import { fmtDay } from "@/lib/who-dates";
import { factButtons, FACT_GROUPS } from "@/lib/watching";
import { posLabel, scopeKind, urlKey } from "@/lib/who-scope";
import type { Answer } from "@/lib/answer";

/** "This title" (named by the title and where you are, "The Rookie S2E8"): the episode or film you are on, then the facts as tappable cards that open in place. No question box. */
export function RootNode() {
  const { brief, pos, spoilers, rootLabel } = useWho();
  const tv = brief.type === "tv";
  const exact = tv && scopeKind(pos) === "exact";
  const [summary, setSummary] = useState(false);
  const wc = useWatchControl();
  const lib = useLib();
  const router = useRouter();
  const mine = wc?.watch && wc.watch.key === brief.key ? wc.watch : null;
  const [ending, setEnding] = useState(false);
  const finish = (watched: boolean) => {
    if (watched) lib.mark({ key: brief.key, type: brief.type, id: brief.id, title: brief.title, year: brief.year, poster: brief.poster }, "watched", undefined, true);
    wc?.stop({ restore: !watched });
    router.push("/");
  };
  const [facts, setFacts] = useState<Record<string, Answer | "loading">>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { setFacts({}); setOpen({}); setSummary(false); }, [brief.key, pos?.s, pos?.e, spoilers]);
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
        <h2 className="wx-pname" tabIndex={-1} data-focus-target>{rootLabel}</h2>
      </header>

      <section className="wx-sec" aria-label={tv ? "Where you are" : "The film"}>
        {tv && exact && <EpisodeCard key={`${pos!.s}-${pos!.e}`} s={pos!.s!} e={pos!.e!} />}
        {tv && !exact && <p className="small" style={{ margin: 0 }}>{pos?.s == null ? "The season is not set." : `${posLabel(pos)}: the episode is not set.`} Pick an episode above.</p>}
        {!tv && (
          <div className="wx-epcard">
            <ZoomBtn path={brief.poster} name={brief.title} className="wx-filmposterb"><Photo path={brief.poster} name={brief.title} w="w342" className="wx-filmposter" /></ZoomBtn>
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
      </section>

      <Section title="About this title" note="Tap a card to open it.">
        {FACT_GROUPS.map((g) => {
          const items = buttons.filter((b) => b.group === g);
          if (!items.length) return null;
          return (
            <div key={g} className="wx-factgroup" role="group" aria-label={g}>
              <h4 className="wx-grouph">{g}</h4>
              <ul className="wx-facts">
                {items.map((b) => {
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
            </div>
          );
        })}
      </Section>

      {mine && (
        <div className="ask-end">
          {ending ? (
            <>
              {brief.type === "movie" && <button type="button" className="btn sm gold" onClick={() => finish(true)}>Finished: mark watched</button>}
              <button type="button" className="btn sm" onClick={() => finish(false)}>Stop watching</button>
              <button type="button" className="linkish small" onClick={() => setEnding(false)}>Keep watching</button>
            </>
          ) : <button type="button" className="linkish small" onClick={() => setEnding(true)}>End this watch</button>}
        </div>
      )}
    </div>
  );
}
