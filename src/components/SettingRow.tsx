"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useBackClose } from "@/lib/back-layer";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** One settings line: label on the left, a short summary and a chevron on the right. Tapping it opens the details in a popup. */
export default function SettingRow({ label, value, title, children }: { label: string; value?: ReactNode; title?: string; children: ReactNode | ((close: () => void) => ReactNode) }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className="srow link" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span>{label}</span>
        <span className="sval">{value}<span className="chev" aria-hidden="true">›</span></span>
      </button>
      {open && <Popup title={title ?? label} onClose={close}>{typeof children === "function" ? children(close) : children}</Popup>}
    </>
  );
}

function Popup({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useBackClose(true, onClose);
  useEffect(() => {
    const was = document.activeElement as HTMLElement | null;
    box.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; if (was && document.contains(was)) was.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = box.current; if (!el) return;
      if (e.key === "Escape" && !(e.target as HTMLElement).closest("input,textarea,select")) { e.preventDefault(); onClose(); }
      if (e.key === "Tab") {
        const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1], at = document.activeElement;
        if (e.shiftKey && (at === first || at === el)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return createPortal(
    <div ref={box} className="modal pop" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-bar">
          <b>{title}</b>
          <button type="button" className="back" onClick={onClose} aria-label="Close"><span aria-hidden="true">&#215;</span> Close</button>
        </div>
        <div className="sheet-body" style={{ paddingTop: 12 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
