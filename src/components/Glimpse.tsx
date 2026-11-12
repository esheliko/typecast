"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { GlimpseImage } from "@/app/api/glimpse/route";

import { infoQuery, tabsWithRoles, type GlimpseInfo, type GlimpseSpec, type LibRole } from "@/lib/glimpse";
import type { GlimpseAbout } from "@/lib/glimpse-data";
import { epCode, fmtDate, plural } from "@/lib/episodes";
import { useBackClose } from "@/lib/back-layer";

const Ctx = createContext<(s: GlimpseSpec) => void>(() => {});
export const useGlimpse = () => useContext(Ctx);

type Res = { state: "loading" } | { state: "ok"; images: GlimpseImage[]; configured: boolean } | { state: "error"; msg: string };
const gUrl = (q: string) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`;

/**
 * Everything the panel shows is fetched ahead and kept here, so opening it or switching tabs never waits: `prefetchGlimpse` runs when a button
 * scrolls into view (the words) and when a finger or pointer comes near it (everything, thumbnails included).
 */
const imgCache = new Map<string, Promise<Res>>();
const imgDone = new Map<string, Res>();
function loadImages(q: string): Promise<Res> {
  const hit = imgCache.get(q);
  if (hit) return hit;
  const p: Promise<Res> = fetch(`/api/glimpse?q=${encodeURIComponent(q)}`)
    .then(async (r): Promise<Res> => {
      const j = await r.json().catch(() => ({})) as { configured?: boolean; images?: GlimpseImage[]; error?: string };
      return r.ok ? { state: "ok", images: j.images ?? [], configured: j.configured !== false } : { state: "error", msg: j.error ?? `Image search failed (${r.status})` };
    })
    .catch((): Res => ({ state: "error", msg: "Could not reach image search. Check your connection." }))
    .then((r) => {
      if (r.state === "ok") { imgDone.set(q, r); for (const im of r.images.slice(0, 12)) { const i = new Image(); i.referrerPolicy = "no-referrer"; i.src = im.thumb; } }
      else imgCache.delete(q); // a failed answer is asked again next time
      return r;
    });
  imgCache.set(q, p);
  return p;
}

const rolesCache = new Map<string, Promise<LibRole[]>>();
function loadRoles(pid: number, key?: string): Promise<LibRole[]> {
  const k = `${pid}|${key ?? ""}`;
  const hit = rolesCache.get(k);
  if (hit) return hit;
  const p = fetch(`/api/glimpse/roles?p=${pid}${key ? `&k=${encodeURIComponent(key)}` : ""}`)
    .then(async (r) => (r.ok ? ((await r.json()) as { roles?: LibRole[] }).roles ?? [] : Promise.reject(new Error("roles"))))
    .catch(() => { rolesCache.delete(k); return [] as LibRole[]; });
  rolesCache.set(k, p);
  setTimeout(() => { if (rolesCache.get(k) === p) rolesCache.delete(k); }, 5 * 60_000); // the library can change
  return p;
}

/** Ask for what a button's panel will need. `images`: also the image searches (costlier, so only on intent or open). */
export function prefetchGlimpse(spec: GlimpseSpec, images: boolean) {
  const one = (info: GlimpseInfo | undefined, q: string | undefined) => {
    if (info) loadAbout(infoQuery(info)).catch(() => {});
    if (images && q) loadImages(q);
  };
  spec.tabs.forEach((t, i) => one(t.info ?? (i === 0 ? spec.info : undefined), t.q));
  if (spec.libRoles && spec.info?.pid) loadRoles(spec.info.pid, spec.info.key).then((rs) => { if (rs.length) tabsWithRoles(spec, rs).forEach((t) => one(t.info, t.q)); });
}

export function GlimpseProvider({ children }: { children: React.ReactNode }) {
  const [spec, setSpec] = useState<GlimpseSpec | null>(null);
  const [tabQ, setTabQ] = useState<string | null>(null);
  const [rolesSt, setRolesSt] = useState<{ k: string; v: LibRole[] } | null>(null);
  const [res, setRes] = useState<Record<string, Res>>({});
  const [big, setBig] = useState<GlimpseImage | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const open = useCallback((s: GlimpseSpec) => { opener.current = document.activeElement as HTMLElement | null; setTabQ(null); setBig(null); setSpec(s); }, []);
  const close = useCallback(() => { setSpec(null); setBig(null); const o = opener.current; if (o && document.contains(o)) o.focus({ preventScroll: true }); }, []);

  // Back button: first leaves a big image, then closes the panel.
  useBackClose(!!spec, close);
  useBackClose(!!big, useCallback(() => setBig(null), []));

  // The actor's other roles in the library arrive after opening (usually already prefetched): extra tabs after the first.
  const pid = spec?.libRoles ? spec.info?.pid : undefined, tkey = spec?.info?.key;
  const rk = pid ? `${pid}|${tkey ?? ""}` : null;
  useEffect(() => {
    if (!pid || !rk) return;
    let live = true;
    loadRoles(pid, tkey).then((v) => { if (live) setRolesSt({ k: rk, v }); });
    return () => { live = false; };
  }, [pid, tkey, rk]);
  const tabs = useMemo(() => (spec ? tabsWithRoles(spec, rolesSt && rolesSt.k === rk ? rolesSt.v : null) : []), [spec, rolesSt, rk]);
  const curTab = tabs.find((t) => t.q === tabQ) ?? tabs[0];
  const q = curTab?.q;

  // Every tab's images are fetched at once (each query once), so switching tabs shows them straight away.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    for (const t of tabs) {
      if (asked.current.has(t.q)) continue;
      asked.current.add(t.q);
      loadImages(t.q).then((r) => { if (r.state === "error") asked.current.delete(t.q); setRes((m) => ({ ...m, [t.q]: r })); });
      if (t.info) loadAbout(infoQuery(t.info)).catch(() => {});
    }
  }, [tabs]);

  useEffect(() => {
    if (!spec) return;
    box.current?.focus({ preventScroll: true });
    // Capture phase on window so Esc closes only this panel, not the title popup underneath it.
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (big) setBig(null); else close(); } };
    window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true);
  }, [spec, big, close]);

  const cur = q ? imgDone.get(q) ?? res[q] : undefined;
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
              {tabs.length > 1 && (
                <div className="gl-tabs" role="tablist">
                  {tabs.map((t) => <button key={t.q} type="button" role="tab" aria-selected={t.q === q} className={t.q === q ? "on" : ""} onClick={() => { setTabQ(t.q); setBig(null); }}>{t.label}</button>)}
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
              {/* The images come first: that is what the panel is opened for. The words about it follow below them. */}
              {(curTab.info ?? spec.info) && <div style={{ marginTop: 16 }}><About info={(curTab.info ?? spec.info)!} /></div>}
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

// Kept a minute only: marking a title Watched changes what the server tells, and the panel should follow.
const aboutCache = new Map<string, { t: number; p: Promise<GlimpseAbout>; v?: GlimpseAbout }>();
function loadAbout(qs: string): Promise<GlimpseAbout> {
  const hit = aboutCache.get(qs);
  if (hit && Date.now() - hit.t < 60_000) return hit.p;
  const p = fetch(`/api/glimpse/info?${qs}`).then(async (r) => { if (!r.ok) throw new Error("lookup failed"); return r.json() as Promise<GlimpseAbout>; });
  p.catch(() => { if (aboutCache.get(qs)?.p === p) aboutCache.delete(qs); });
  const entry: { t: number; p: Promise<GlimpseAbout>; v?: GlimpseAbout } = { t: Date.now(), p };
  p.then((v) => { entry.v = v; }, () => {});
  aboutCache.set(qs, entry);
  return p;
}
/** The answer if it is already here (prefetched), so the panel opens with it instead of a "reading up" line. */
const peekAbout = (qs: string): GlimpseAbout | null => { const h = aboutCache.get(qs); return h && h.v && Date.now() - h.t < 60_000 ? h.v : null; };

const EPS_SHOWN = 8;

/**
 * The words above the images: a title's summary, a person's summary, or a person's part in a title (the character, the episodes and when).
 * The server applies the Watching-now spoiler rules it is given in `info`. Fails soft: a failed lookup shows a small note and the images still work.
 */
function About({ info }: { info: GlimpseInfo }) {
  const base = infoQuery(info);
  // The reader chose to see everything despite the spoiler rules (per question, so another panel starts careful again).
  const [riskFor, setRiskFor] = useState<string | null>(null);
  const qs = riskFor === base ? `${base}&full=1` : base;
  const [st, setSt] = useState<{ qs: string; v: GlimpseAbout | "error" } | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    let live = true;
    loadAbout(qs).then((v) => { if (live) setSt({ qs, v }); }, () => { if (live) setSt({ qs, v: "error" }); });
    return () => { live = false; };
  }, [qs]);
  const cur = st && st.qs === qs ? st.v : peekAbout(qs);
  if (!cur) return <div className="gl-about" role="status"><p className="muted small"><span className="spin" aria-hidden="true" />Reading up on it…</p></div>;
  if (cur === "error") return <div className="gl-about"><p className="small muted">Could not load the summary right now.</p></div>;
  const { role, title, person } = cur;
  if (!role && !title && !person) return null;
  const reveal = cur.limited && riskFor !== base
    ? <p className="small"><button type="button" className="btn sm" onClick={() => setRiskFor(base)}>Show the full description anyway</button> <span className="muted">May contain spoilers.</span></p>
    : null;
  const eps = role ? (all ? role.episodes : role.episodes.slice(0, EPS_SHOWN)) : [];
  return (
    <div className="gl-about">
      {role && (
        <section className="gl-sec-b" aria-label="The role">
          <h3 className="gl-sec">{role.character ? `The character: ${role.character}` : "In this title"}</h3>
          {role.summary ? (
            <p className="gl-text">{role.summary}{role.source && <> <a className="small" href={role.source.url} target="_blank" rel="noopener noreferrer">{role.source.label}</a></>}</p>
          ) : <p className="small muted">No description of this character found.{role.character && <> <a href={`https://www.google.com/search?q=${encodeURIComponent(`${role.character} ${role.show} character`)}`} target="_blank" rel="noopener noreferrer">Search the web</a></>}</p>}
          {role.short && <p className="small muted">Kept short so it does not give the story away. Mark it Watched to see everything.</p>}
          {reveal}
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
          {!role && reveal}
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
  const ref = useRef<HTMLButtonElement>(null);
  const specRef = useRef(spec);
  useEffect(() => { specRef.current = spec; });
  // Words and roles once the button has been on screen for a moment; everything (images too) when a pointer or finger reaches for it.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(timer);
      if (e?.isIntersecting) timer = setTimeout(() => { prefetchGlimpse(specRef.current, false); io.disconnect(); }, 600);
    });
    io.observe(el);
    return () => { clearTimeout(timer); io.disconnect(); };
  }, []);
  const warm = () => prefetchGlimpse(spec, true);
  return (
    <button ref={ref} type="button" className="gl-b" onPointerEnter={warm} onFocus={warm} onTouchStart={warm} onClick={() => open(spec)} aria-label={text} title={text}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="17" height="15" rx="3" /><circle cx="8.5" cy="11" r="2.1" /><path d="M5 17.2c.5-2 1.9-3.1 3.5-3.1s3 1.1 3.5 3.1" /><path d="M14.5 10h2.5M14.5 13h2.5M14.5 16h1.5" /><path d="M20 1.5v4M18 3.5h4" /></svg>
    </button>
  );
}
