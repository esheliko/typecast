"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Browse", icon: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>' },
  { href: "/library", label: "Library", icon: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 9h16M9 4v16"/>' },
  { href: "/setup", label: "Setup", icon: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>' },
];

export default function Tabs({ where }: { where: "top" | "bottom" }) {
  const path = usePathname();
  const active = (h: string) => (h === "/" ? path === "/" || path.startsWith("/title") || path.startsWith("/person") : path.startsWith(h));
  return (
    <nav className={where === "top" ? "tabs-top" : "tabs-bottom"} aria-label="Sections">
      {TABS.map((t) => (
        <Link key={t.href} className="tab" href={t.href} aria-current={active(t.href) ? "page" : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: t.icon }} />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
