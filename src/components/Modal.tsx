"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentProps } from "react";
import { TitleSkeleton } from "./Skeletons";
import { href, img, typeLabel } from "@/lib/img";

const InModal = createContext(false);
/** The title whose page this link sits on; passed along so the next popup can say where it was opened from. */
const FromTitle = createContext<{ key: string; name: string } | null>(null);
export function FromProvider({ k, name, children }: { k: string; name: string; children: React.ReactNode }) {
  return <FromTitle.Provider value={{ key: k, name }}>{children}</FromTitle.Provider>;
}

/**
 * A link to a title page. Titles open as a popup over whatever page you are on (see app/(app)/@modal), so it never scrolls
 * the page behind. Inside the popup each title is a new history entry, so the popup's Back / Forward buttons walk through them
 * and Close returns to the page you came from. Hovering or touching a link warms the cache so the popup opens instantly.
 */
/** What the popup can show before its details arrive: the title and poster of the thing you just tapped. */
type Peek = { title: string; year?: string | number; poster?: string | null; src?: string };
const peeked = new Map<string, Peek>();

export function TitleLink({ k, it, onClick, ...rest }: { k: string; it?: Peek } & Omit<ComponentProps<typeof Link>, "href" | "replace" | "scroll" | "prefetch">) {
  const from = useContext(FromTitle);
  const [warm, setWarm] = useState(false);
  const url = from && from.key !== k ? `${href(k)}?${new URLSearchParams({ from: from.key, fn: from.name })}` : href(k);
  const heat = () => setWarm(true);
  // Reuse the poster image already on screen (an exact cache hit) so the popup has art the moment it opens.
  const remember = (el: HTMLElement) => { if (it) peeked.set(k, { title: it.title, year: it.year, poster: it.poster, src: el.querySelector("img")?.currentSrc || undefined }); };
  return <Link href={url} scroll={false} prefetch={warm ? true : null} onMouseEnter={heat} onFocus={heat} onTouchStart={heat}
    onClick={(e) => { remember(e.currentTarget); onClick?.(e); }} {...rest} />;
}

/** The popup's loading state: the title and poster you tapped (when known) over placeholders for the rest. */
export function ModalLoading() {
  const m = /^\/title\/(movie|tv)\/(\d+)/.exec(usePathname());
  const p = m ? peeked.get(`${m[1]}:${m[2]}`) : undefined;
  const sub = m && p ? [p.year, typeLabel(m[1])].filter(Boolean).join(" · ") : undefined;
  return <TitleSkeleton title={p?.title} poster={p?.src || (p?.poster ? img(p.poster, "w185") : undefined)} sub={sub} />;
}

const BG = "tc:bg";
const safe = <T,>(f: () => T, d: T): T => { try { return f(); } catch { return d; } };

/** Remembers the last page that was not a title, so a refresh on a popup can put the popup back over that page. */
export function BgTracker() {
  const path = usePathname();
  const sp = useSearchParams();
  useEffect(() => {
    if (path.startsWith("/title")) return;
    const q = sp.toString();
    safe(() => sessionStorage.setItem(BG, path + (q ? `?${q}` : "")), undefined);
  }, [path, sp]);
  return null;
}

/**
 * Wraps the full title page. A hard load (refresh, shared link) of a title would otherwise show the bare page; instead it
 * replays the original navigation: go to the page that was underneath, then open the title as a popup again.
 * "Open full page" adds ?full=1 to skip this.
 */
export function RestorePopup({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.has("full")) { setShow(true); return; }
    const bg = safe(() => sessionStorage.getItem(BG), null);
    const here = u.pathname + u.search;
    router.replace(bg && !bg.startsWith("/title") ? bg : "/", { scroll: false });
    router.push(here, { scroll: false });
  }, [router]);
  return show ? <>{children}</> : <p className="muted" style={{ margin: "28px 0" }}><span className="spin" />Loading details</p>;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

/** "Opened from X" line at the top of a popup; X goes back to that title. */
export function OpenedFrom({ k, name }: { k: string; name: string }) {
  return <p className="small" style={{ margin: "6px 0 0" }}>Opened from <TitleLink k={k}><b>{name}</b></TitleLink></p>;
}

/** The popup frame for title details. Close (button, Esc, tap outside) returns to the page underneath, untouched; Back / Forward step through titles opened inside the popup. */
export function Modal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams().toString();
  const here = path + (sp ? `?${sp}` : "");
  const box = useRef<HTMLDivElement>(null);
  const stack = useRef<string[]>([here]);
  const [pos, setPos] = useState({ i: 0, n: 1 });
  // Back / Forward through the popup's own trail; Close jumps all the way back to the page underneath.
  const idx = useRef(0);
  const close = useCallback(() => { window.history.go(-(idx.current + 1)); }, []);

  useEffect(() => {
    const st = stack.current;
    if (st[idx.current] === here) return;
    if (st[idx.current - 1] === here) idx.current--;
    else if (st[idx.current + 1] === here) idx.current++;
    else { stack.current = [...st.slice(0, idx.current + 1), here]; idx.current++; }
    setPos({ i: idx.current, n: stack.current.length });
  }, [here]);

  useEffect(() => {
    const was = document.activeElement as HTMLElement | null;
    box.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; if (was && document.contains(was)) was.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { box.current?.querySelector(".sheet")?.scrollTo({ top: 0 }); }, [path]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = box.current; if (!el) return;
      if (e.key === "Escape" && !(e.target as HTMLElement).closest("input,textarea,select")) { e.preventDefault(); close(); }
      if (e.key === "Tab") {
        const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1], at = document.activeElement;
        if (e.shiftKey && (at === first || at === el)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [close]);

  return (
    <InModal.Provider value>
      <div ref={box} className="modal" role="dialog" aria-modal="true" aria-label="Title details" tabIndex={-1} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className="sheet">
          <div className="sheet-bar">
            <div className="sheet-nav">
              <button type="button" className="back strong" disabled={pos.i === 0} onClick={() => router.back()} aria-label="Back to previous title"><span aria-hidden="true">&#8249;</span></button>
              <button type="button" className="back strong" disabled={pos.i >= pos.n - 1} onClick={() => router.forward()} aria-label="Forward to next title"><span aria-hidden="true">&#8250;</span></button>
            </div>
            <div className="sheet-nav">
              {/* A plain link on purpose: it loads the full page instead of opening another popup. */}
              <a className="small" href={`${path}?full=1`}>Full page</a>
              <button type="button" className="back" onClick={close} aria-label="Close"><span aria-hidden="true">&#215;</span> Close</button>
            </div>
          </div>
          <div className="sheet-body">{children}</div>
        </div>
      </div>
    </InModal.Provider>
  );
}
