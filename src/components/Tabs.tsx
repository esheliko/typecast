"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Browse", icon: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>' },
  { href: "/library", label: "Library", icon: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 9h16M9 4v16"/>' },
  { href: "/setup", label: "Settings", icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>' },
];

export default function Tabs({ where }: { where: "top" | "bottom" }) {
  const path = usePathname();
  // Both bars are in the page and CSS shows one of them; only the shown one prefetches, so each tab's page is not fetched twice.
  const nav = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  // A hard load of a title or person is replayed as a popup over the page underneath (RestorePopup), which fetches that page itself: the tabs wait until a page
  // that is not a popup is on screen, so "/" is not asked for by both. Once armed it stays armed (opening a popup later does not switch prefetching off and on).
  // `armed` is that first page (null until then); its own tab is the page just fetched, so it never prefetches.
  const [armed, setArmed] = useState<string | null>(null);
  const inPopup = /^\/(title|person)(\/|$)/.test(path);
  useEffect(() => { if (!inPopup) setArmed((a) => a ?? path); }, [inPopup, path]);
  useEffect(() => {
    const check = () => setShown(!!nav.current && getComputedStyle(nav.current).display !== "none");
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const active = (h: string) => (h === "/" ? path === "/" || path.startsWith("/title") || path.startsWith("/person") : path.startsWith(h));
  return (
    <nav ref={nav} className={where === "top" ? "tabs-top" : "tabs-bottom"} aria-label="Sections">
      {TABS.map((t) => (
        <Link key={t.href} className="tab" href={t.href} prefetch={shown && armed !== null && t.href !== armed} aria-current={active(t.href) ? "page" : undefined}
          onClick={() => { if (t.href === "/" && path === "/") window.dispatchEvent(new Event("tc:clear-search")); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: t.icon }} />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
