"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useLib } from "../cast/LibState";
import { FactView, useWatchControl } from "../Watching";
import { EpisodeCard } from "./EpisodeCard";
import { Section, Sk, ZoomBtn, Photo } from "./bits";
import { useWho } from "./WhoContext";
import { fmtDay } from "@/lib/who-dates";
import { factButtons, FACT_GROUPS, type FactGroup } from "@/lib/watching";
import { FactIcon } from "./FactIcon";
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
  const [tab, setTab] = useState<FactGroup>(FACT_GROUPS[0]);
  const started = useRef(new Set<string>());
  useEffect(() => { setSummary(false); setTab(FACT_GROUPS[0]); }, [brief.key]);
  const scope = `${brief.key}|${pos?.s ?? ""}|${pos?.e ?? ""}|${spoilers ? 1 : 0}`;
  const load = (label: string, q: string) => {
    const id = `${scope}|${label}`;
    if (started.current.has(id)) return;
    started.current.add(id);
    setFacts((f) => ({ ...f, [id]: "loading" }));
    const done = (a: Answer) => setFacts((f) => ({ ...f, [id]: a }));
    fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q, spoilers, k: urlKey(brief.key), s: pos?.s ?? undefined, e: pos?.e ?? undefined }) })
      .then(async (r) => { const j = await r.json().catch(() => ({})); done(r.ok && typeof j.text === "string" ? j : { text: j.error ?? `Couldn't look that up (${r.status}). Tap the tab again to retry.` }); if (!r.ok) started.current.delete(id); })
      .catch(() => { done({ text: "Couldn't reach Typecast. Check your connection." }); started.current.delete(id); });
  };
  const buttons = factButtons(brief.type).filter((b) => exact || !["Episodes left", "This episode"].includes(b.label));
  const tabs = FACT_GROUPS.filter((g) => buttons.some((b) => b.group === g));
  const cur = tabs.includes(tab) ? tab : tabs[0];
  const inTab = buttons.filter((b) => b.group === cur);
  useEffect(() => { for (const b of inTab) load(b.label, b.q); }, [cur, scope]); // eslint-disable-line react-hooks/exhaustive-deps

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

      <Section title="About this title">
        <div className="wx-ftabs" role="tablist" aria-label="About this title">
          {tabs.map((g) => (
            <button key={g} type="button" role="tab" id={`wx-tab-${g}`} aria-selected={g === cur} aria-controls="wx-fpanel" tabIndex={g === cur ? 0 : -1} className={`wx-ftab${g === cur ? " on" : ""}`} data-g={g}
              onClick={() => setTab(g)}
              onKeyDown={(e) => { const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!d) return; e.preventDefault(); const n = tabs[(tabs.indexOf(g) + d + tabs.length) % tabs.length]; setTab(n); document.getElementById(`wx-tab-${n}`)?.focus(); }}>
              <FactIcon name={g} /><span>{g}</span>
            </button>
          ))}
        </div>
        <div id="wx-fpanel" role="tabpanel" aria-labelledby={`wx-tab-${cur}`} className="wx-fpanel" data-g={cur}>
          {inTab.map((b) => {
            const f = facts[`${scope}|${b.label}`];
            return (
              <section key={b.label} className="wx-frow" aria-label={b.label}>
                <h4 className="wx-frowh"><span className="wx-ficon" aria-hidden="true"><FactIcon name={b.label} /></span>{b.label}</h4>
                <div className="wx-factbody" aria-live="polite">
                  {f === "loading" || !f ? <div aria-hidden="true"><Sk w="90%" h={13} /><Sk w="70%" h={13} style={{ marginTop: 8 }} /></div> : <FactView a={f} onLeave={() => {}} />}
                </div>
              </section>
            );
          })}
        </div>
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
