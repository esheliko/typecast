"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { GlimpseImage } from "@/app/api/glimpse/route";

import { infoQuery, type GlimpseInfo, type GlimpseSpec } from "@/lib/glimpse";
import type { GlimpseAbout } from "@/lib/glimpse-data";
import { epCode, fmtDate, plural } from "@/lib/episodes";
import { useBackClose } from "@/lib/back-layer";

const Ctx = createContext<(s: GlimpseSpec) => void>(() => {});
export const useGlimpse = () => useContext(Ctx);

type Res = { state: "loading" } | { state: "ok"; images: GlimpseImage[]; configured: boolean } | { state: "error"; msg: string };
const gUrl = (q: string) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`;

export function GlimpseProvider({ children }: { children: React.ReactNode }) {
  const [spec, setSpec] = useState<GlimpseSpec | null>(null);
  const [tab, setTab] = useState(0);
  const [res, setRes] = useState<Record<string, Res>>({});
  const [big, setBig] = useState<GlimpseImage | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const open = useCallback((s: GlimpseSpec) => { opener.current = document.activeElement as HTMLElement | null; setTab(0); setBig(null); setSpec(s); }, []);
  const close = useCallback(() => { setSpec(null); setBig(null); const o = opener.current; if (o && document.contains(o)) o.focus({ preventScroll: true }); }, []);

  // Back button: first leaves a big image, then closes the panel.
  useBackClose(!!spec, close);
  useBackClose(!!big, useCallback(() => setBig(null), []));

  const q = spec?.tabs[tab]?.q;
  // Each query is fetched once. No abort on cleanup: storing the "loading" state re-runs this effect, which would cancel its own request.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!q || asked.current.has(q)) return;
    asked.current.add(q);
    setRes((r) => ({ ...r, [q]: { state: "loading" } }));
    fetch(`/api/glimpse?q=${encodeURIComponent(q)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({})) as { configured?: boolean; images?: GlimpseImage[]; error?: string };
        setRes((m) => ({ ...m, [q]: r.ok ? { state: "ok", images: j.images ?? [], configured: j.configured !== false } : { state: "error", msg: j.error ?? `Image search failed (${r.status})` } }));
      })
      .catch(() => { asked.current.delete(q); setRes((m) => ({ ...m, [q]: { state: "error", msg: "Could not reach image search. Check your connection." } })); });
  }, [q]);

  useEffect(() => {
    if (!spec) return;
    box.current?.focus({ preventScroll: true });
    // Capture phase on window so Esc closes only this panel, not the title popup underneath it.
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (big) setBig(null); else close(); } };
    window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true);
  }, [spec, big, close]);

  const cur = q ? res[q] : undefined;
  return (
    <Ctx.Provider value={open}>
      {children}
      {spec && q && (
        <div className="gl-wrap" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div ref={box} className="gl" role="dialog" aria-modal="true" aria-label={spec.heading} tabIndex={-1}>
            <div className="gl-bar">
              <b className="gl-h">{spec.heading}</b>
              <button type="button" className="back" onClick={close} aria-label="Close"><span aria-hidden="true">&#215;</span> Close</button>
            </div>
            <div className="gl-body">
              {spec.info && <About info={spec.info} />}
              {spec.info && <h3 className="gl-sec">Images</h3>}
              {spec.tabs.length > 1 && (
              <div className="gl-tabs" role="tablist">
                {spec.tabs.map((t, i) => <button key={t.q} type="button" role="tab" aria-selected={i === tab} className={i === tab ? "on" : ""} onClick={() => { setTab(i); setBig(null); }}>{t.label}</button>)}
              </div>
            )}
              {(!cur || cur.state === "loading") && <p className="muted" role="status"><span className="spin" aria-hidden="true" />Finding images…</p>}
              {cur?.state === "error" && <p className="err">{cur.msg}</p>}
              {cur?.state === "ok" && !cur.configured && <p className="small muted">Image search is not set up here yet. Use “More in Google Images” below.</p>}
              {cur?.state === "ok" && cur.configured && cur.images.length === 0 && <p className="muted">No images found.</p>}
              {big && (
                <figure className="gl-big">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={big.full} alt={big.title} referrerPolicy="no-referrer" onError={(e) => { (e.currentTarget as HTMLImageElement).src = big.thumb; }} />
                  <figcaption className="small"><a href={big.page} target="_blank" rel="noopener noreferrer">Source page</a> · <button type="button" className="linkish" onClick={() => setBig(null)}>Back to results</button></figcaption>
                </figure>
              )}
              {!big && cur?.state === "ok" && cur.images.length > 0 && (
                <ul className="gl-grid">
                  {cur.images.map((im) => (
                    <li key={im.full}>
                      <button type="button" onClick={() => setBig(im)} aria-label={im.title || "View image"}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={im.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <a className="btn sm gold" href={gUrl(q)} target="_blank" rel="noopener noreferrer" style={{ marginTop: 12 }}>More in Google Images</a>
              <p className="small muted" style={{ margin: "8px 0 0" }}>Searching: {q}</p>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

const aboutCache = new Map<string, Promise<GlimpseAbout>>();
function loadAbout(qs: string): Promise<GlimpseAbout> {
  let p = aboutCache.get(qs);
  if (!p) {
    p = fetch(`/api/glimpse/info?${qs}`).then(async (r) => { if (!r.ok) throw new Error("lookup failed"); return r.json() as Promise<GlimpseAbout>; });
    p.catch(() => aboutCache.delete(qs));
    aboutCache.set(qs, p);
  }
  return p;
}

const EPS_SHOWN = 8;

/**
 * The words above the images: a title's summary, a person's summary, or a person's part in a title (the character, the episodes and when).
 * The server applies the Watching-now spoiler rules it is given in `info`. Fails soft: a failed lookup shows a small note and the images still work.
 */
function About({ info }: { info: GlimpseInfo }) {
  const qs = infoQuery(info);
  const [st, setSt] = useState<{ qs: string; v: GlimpseAbout | "error" } | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    let live = true;
    loadAbout(qs).then((v) => { if (live) setSt({ qs, v }); }, () => { if (live) setSt({ qs, v: "error" }); });
    return () => { live = false; };
  }, [qs]);
  const cur = st && st.qs === qs ? st.v : null;
  if (!cur) return <div className="gl-about" role="status"><p className="muted small"><span className="spin" aria-hidden="true" />Reading up on it…</p></div>;
  if (cur === "error") return <div className="gl-about"><p className="small muted">Could not load the summary right now.</p></div>;
  const { role, title, person } = cur;
  if (!role && !title && !person) return null;
  const eps = role ? (all ? role.episodes : role.episodes.slice(0, EPS_SHOWN)) : [];
  return (
    <div className="gl-about">
      {role && (
        <section className="gl-sec-b" aria-label="The role">
          <h3 className="gl-sec">{role.character ? `The character: ${role.character}` : "In this title"}</h3>
          {role.summary ? (
            <p className="gl-text">{role.summary}{role.source && <> <a className="small" href={role.source.url} target="_blank" rel="noopener noreferrer">{role.source.label}</a></>}</p>
          ) : <p className="small muted">No description of this character found.</p>}
          {role.short && <p className="small muted">Kept short so it does not give the story away.</p>}
          {role.line && <p className="gl-line">{role.line}</p>}
          {role.note && <p className="small muted">{role.note}</p>}
          {eps.length > 0 && (
            <ul className="gl-eps" aria-label="Episodes">
              {eps.map((x) => <li key={`${x.s}:${x.e}`}><span className="ep-code">{epCode(x.s, x.e)}</span><span className="gl-epn">{x.name}</span><span className="gl-epd">{x.air ? fmtDate(x.air) : ""}</span></li>)}
            </ul>
          )}
          {!all && role.episodes.length > EPS_SHOWN && <button type="button" className="btn sm" onClick={() => setAll(true)}>All {role.episodes.length} episodes</button>}
          {role.seasonRows.length > 0 && (
            <>
              <ul className="gl-eps" aria-label="Seasons">
                {role.seasonRows.map((x) => <li key={x.n}><span className="ep-code">S{x.n}</span><span className="gl-epn">{x.upTo ? `Episodes 1–${x.upTo}` : x.eps ? plural(x.eps, "episode") : "Season"}</span><span className="gl-epd">{x.air ? `from ${fmtDate(x.air)}` : ""}</span></li>)}
              </ul>
              <p className="small muted">A series regular: TMDB lists the seasons they are in, not each episode.</p>
            </>
          )}
        </section>
      )}
      {title && (
        <section className="gl-sec-b" aria-label="About the title">
          <h3 className="gl-sec">About {title.name}</h3>
          {title.line && <p className="gl-line">{title.line}</p>}
          <p className="gl-text">{title.overview || "No summary on TMDB yet."}</p>
        </section>
      )}
      {person && (
        <section className="gl-sec-b" aria-label="About the person">
          <h3 className="gl-sec">About {person.name}</h3>
          {person.line && <p className="gl-line">{person.line}</p>}
          <p className="gl-text">{person.bio || "No biography on TMDB yet."}</p>
        </section>
      )}
    </div>
  );
}

/**
 * The profile-card button (a framed face with lines of text and a spark), so it reads as "the story behind it", not as search or photos only.
 * Opens the panel (summary, the character and its episodes, and images) for whatever it sits beside. Never place it inside a link or summary.
 */
export function GlimpseButton({ spec, label }: { spec: GlimpseSpec; label?: string }) {
  const open = useGlimpse();
  const text = label ?? (spec.info ? `About ${spec.heading}` : `See images of ${spec.heading}`);
  return (
    <button type="button" className="gl-b" onClick={() => open(spec)} aria-label={text} title={text}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="17" height="15" rx="3" /><circle cx="8.5" cy="11" r="2.1" /><path d="M5 17.2c.5-2 1.9-3.1 3.5-3.1s3 1.1 3.5 3.1" /><path d="M14.5 10h2.5M14.5 13h2.5M14.5 16h1.5" /><path d="M20 1.5v4M18 3.5h4" /></svg>
    </button>
  );
}
