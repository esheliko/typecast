"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, type ComponentProps } from "react";
import { href } from "@/lib/img";

const InModal = createContext(false);
/** The title whose page this link sits on; passed along so the next popup can say where it was opened from. */
const FromTitle = createContext<{ key: string; name: string } | null>(null);
export function FromProvider({ k, name, children }: { k: string; name: string; children: React.ReactNode }) {
  return <FromTitle.Provider value={{ key: k, name }}>{children}</FromTitle.Provider>;
}

/**
 * A link to a title page. Titles open as a popup over whatever page you are on (see app/(app)/@modal), so it never scrolls
 * the page behind. Inside the popup it replaces the current title, so Close always returns to the page you came from.
 */
export function TitleLink({ k, ...rest }: { k: string } & Omit<ComponentProps<typeof Link>, "href" | "replace" | "scroll">) {
  const inModal = useContext(InModal);
  const from = useContext(FromTitle);
  const url = from && from.key !== k ? `${href(k)}?${new URLSearchParams({ from: from.key, fn: from.name })}` : href(k);
  return <Link href={url} replace={inModal} scroll={false} {...rest} />;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

/** "Opened from X" line at the top of a popup; X goes back to that title. */
export function OpenedFrom({ k, name }: { k: string; name: string }) {
  return <p className="small" style={{ margin: "6px 0 0" }}>Opened from <TitleLink k={k}><b>{name}</b></TitleLink></p>;
}

/** The popup frame for title details. Close (button, Esc, tap outside, or the browser Back button) returns to the page underneath, untouched. */
export function Modal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => router.back(), [router]);

  useEffect(() => {
    const was = document.activeElement as HTMLElement | null;
    box.current?.focus({ preventScroll: true });
    return () => { if (was && document.contains(was)) was.focus({ preventScroll: true }); };
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
            <button type="button" className="back" onClick={close}><span aria-hidden="true">&#215;</span> Close</button>
            {/* A plain link on purpose: it loads the full page instead of opening another popup. */}
            <a className="small" href={path}>Open full page</a>
          </div>
          <div className="sheet-body">{children}</div>
        </div>
      </div>
    </InModal.Provider>
  );
}
