"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { GlimpseImage } from "@/app/api/glimpse/route";

import type { GlimpseSpec } from "@/lib/glimpse";
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
          <div ref={box} className="gl" role="dialog" aria-modal="true" aria-label={`Images of ${spec.heading}`} tabIndex={-1}>
            <div className="gl-bar">
              <b className="gl-h">{spec.heading}</b>
              <button type="button" className="back" onClick={close} aria-label="Close images"><span aria-hidden="true">&#215;</span> Close</button>
            </div>
            {spec.tabs.length > 1 && (
              <div className="gl-tabs" role="tablist">
                {spec.tabs.map((t, i) => <button key={t.q} type="button" role="tab" aria-selected={i === tab} className={i === tab ? "on" : ""} onClick={() => { setTab(i); setBig(null); }}>{t.label}</button>)}
              </div>
            )}
            <div className="gl-body">
              {(!cur || cur.state === "loading") && <p className="muted"><span className="spin" />Finding images</p>}
              {cur?.state === "error" && <p className="err">{cur.msg}</p>}
              {cur?.state === "ok" && !cur.configured && <p className="small muted">Inline images need an image-search key (SERPER_API_KEY). Until then, open the results in Google Images.</p>}
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

/** The eye button. Opens the image panel for whatever it sits beside. Never place it inside a link or summary. */
export function GlimpseButton({ spec, label }: { spec: GlimpseSpec; label?: string }) {
  const open = useGlimpse();
  const text = label ?? `See images of ${spec.heading}`;
  return (
    <button type="button" className="gl-b" onClick={() => open(spec)} aria-label={text} title={text}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></svg>
    </button>
  );
}
