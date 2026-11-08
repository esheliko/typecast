"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Browse", icon: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>' },
  { href: "/library", label: "Library", icon: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 9h16M9 4v16"/>' },
  { href: "/setup", label: "Settings", icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>' },
];

export default function Tabs({ where }: { where: "top" | "bottom" }) {
  const path = usePathname();
  const active = (h: string) => (h === "/" ? path === "/" || path.startsWith("/title") || path.startsWith("/person") : path.startsWith(h));
  return (
    <nav className={where === "top" ? "tabs-top" : "tabs-bottom"} aria-label="Sections">
      {TABS.map((t) => (
        <Link key={t.href} className="tab" href={t.href} prefetch aria-current={active(t.href) ? "page" : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: t.icon }} />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
