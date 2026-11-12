"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Photo } from "./bits";
import type { ResumeCard } from "@/lib/watch-library";

/**
 * The quiet chevron after the title in the /watching header: a small list of the user's OTHER Watching titles (poster, title, last finished episode; never anything that
 * could spoil) and a way to search another one. Looking at another title changes nothing in the library or the watch. Renders nothing with no other title.
 * The button sits in the title row; its tap target is a ::before hit area, so it adds no height at any width.
 */
export function TitleSwitcher({ cards, title }: { cards: ResumeCard[]; title: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a")?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    const down = (e: PointerEvent) => { const t = e.target as Node; if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false); };
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", down);
    return () => { document.removeEventListener("keydown", key, true); document.removeEventListener("pointerdown", down); };
  }, [open]);

  if (!cards.length) return null;
  return (
    <>
      <button ref={btn} type="button" className="wx-tsw" aria-label="Switch title" aria-expanded={open} aria-haspopup="true" title="Switch title" onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">&#9662;</span>
      </button>
      {open && (
        <nav ref={panel} className="wx-tswm" aria-label={`Switch from ${title}`} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && e.relatedTarget !== btn.current) setOpen(false); }}>
          <ul>
            {cards.map((c) => (
              <li key={c.key}>
                <Link className="wx-tswi" href={c.href} onClick={() => setOpen(false)}>
                  <Photo path={c.poster} name={c.title} w="w92" className="wx-tswp" />
                  <span className="wx-tswt">{c.title}</span>
                  {c.place && <span className="wx-tswe">{c.place}</span>}
                </Link>
              </li>
            ))}
            <li><Link className="wx-tswi wx-tswq" href="/watching?search=1" onClick={() => setOpen(false)}>Search another title&hellip;</Link></li>
          </ul>
        </nav>
      )}
    </>
  );
}
