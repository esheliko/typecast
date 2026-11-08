"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Browse", icon: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>' },
  { href: "/library", label: "Library", icon: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 9h16M9 4v16"/>' },
  { href: "/setup", label: "Settings", icon: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>' },
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
