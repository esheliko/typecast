"use client";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useLib } from "@/components/cast/LibState";
import StatusIcon from "@/components/cast/StatusIcon";
import { setRating } from "@/app/actions";
import { PRIORITY_LABEL, STATUS_LABEL, type Item, type LibItem, type Priority, type Status } from "@/lib/types";

/**
 * The title popup's status controls: the same marks as the quick marks (same names, icons, colours, toast with Undo,
 * confirm before losing a rating or note, "Mark related" after Watched), only bigger and labelled. Tapping the lit one removes the mark.
 * Status and priority live in LibProvider, so the poster underneath changes at once; only the rating is saved from here.
 */
export default function StatusControls({ item, lib }: { item: Item; lib: LibItem | null }) {
  const { get, mark, markRich, touch, defaultPriority } = useLib();
  const m = get(item.key);
  const status = m?.status ?? null;
  const priority: Priority = m?.priority ?? lib?.priority ?? defaultPriority;
  const [pending, start] = useTransition();
  const [rating, setR] = useOptimistic<number, number>(lib?.rating ?? 0, (_s, n) => n);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<number | null>(null);
  // A removed title loses its rating on the server; start from zero if it is added again before the page refreshes.
  useEffect(() => { if (!m) setSaved(0); }, [m]);
  const stars = !m ? 0 : saved ?? rating;
  const toggle = (s: Status) => mark(item, status === s ? null : s, s === "watchlist" ? priority : undefined);
  const rate = (n: number) => {
    const next = stars === n ? 0 : n;
    start(async () => {
      setErr(""); setR(next);
      try { await setRating(item.type, item.id, next); setSaved(next); touch(); if (next > 0) markRich(item.key); }
      catch { setErr("Could not save that. Check your connection and try again."); }
    });
  };
  const [open, setOpen] = useState(false);
  const pick = (s: Status) => { toggle(s); setOpen(false); };
  const cur: Status | null = status;
  const curKind = cur === "watchlist" && priority === "must" ? "must" : cur;
  const opt = (s: Status, cls: string) => (
    <button key={s} type="button" className={`chip sc mc-opt ${cls}`} aria-pressed={status === s} onClick={() => pick(s)}>
      <StatusIcon kind={s === "watchlist" && priority === "must" && status === s ? "must" : s} size={16} />{STATUS_LABEL[s]}
    </button>
  );
  return (
    <div aria-busy={pending}>
      <div className="mc-line">
        {!cur ? (
          // Not in the library yet: say what you can do, one tap, on the same line (the menu keeps Watching / Partial).
          <div className="mc-quick" role="group" aria-label="Add to my library">
            <button type="button" className="chip sc mc-q none" onClick={() => pick("watchlist")}>
              <StatusIcon kind="watchlist" size={16} /><span className="mc-cur-t">Add to Watchlist</span>
            </button>
            <button type="button" className="chip sc mc-q watchedq" onClick={() => pick("watched")}>
              <StatusIcon kind="watched" size={16} /><span className="mc-cur-t">Watched</span>
            </button>
            <button type="button" className="chip sc mc-more" aria-expanded={open} aria-haspopup="true" aria-label="More options: watching, partly watched" onClick={() => setOpen((o) => !o)}>
              <svg className="mc-chev" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ margin: 0, transform: open ? "rotate(180deg)" : undefined }}><path d="M6 9l6 6 6-6" /></svg>
            </button>
          </div>
        ) : (
        <button type="button" className={`chip sc mc-cur ${cur === "watched" ? cur : "none"}${cur === "watchlist" && priority === "must" ? " must" : ""}`} aria-expanded={open} aria-haspopup="true"
          aria-label={cur ? `${STATUS_LABEL[cur]}. Change` : "Add to my library"} onClick={() => setOpen((o) => !o)}>
          {curKind ? <StatusIcon kind={curKind} size={16} /> : <span aria-hidden="true">+</span>}
          <span className="mc-cur-t">{cur ? STATUS_LABEL[cur] : "Add to my library"}</span>
          <svg className="mc-chev" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }}><path d="M6 9l6 6 6-6" /></svg>
        </button>
        )}
        {status && (
          <div className="stars" role="group" aria-label="Your rating" style={{ fontSize: 20 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => rate(n)} aria-label={`${n} stars`} style={{ color: "var(--gold)" }}>{n <= stars ? "★" : "☆"}</button>
            ))}
          </div>
        )}
      </div>
      {open && (
        <div className="mc-menu">
          <div className="mc-grid" role="group" aria-label="Status">
            {opt("watchlist", priority === "must" ? "must" : "watchlist")}
            {opt("watching", "watching")}
            {opt("partial", "partial")}
            {opt("watched", "watched")}
          </div>
          {status === "watchlist" && (
            <div className="mc-row" role="group" aria-label="How much you want to watch it">
              <span className="mc-label">How much do you want it?</span>
              <div className="seg">
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                  <button key={p} type="button" aria-pressed={priority === p} onClick={() => mark(item, "watchlist", p)}>{PRIORITY_LABEL[p]}</button>
                ))}
              </div>
            </div>
          )}
          {status && (
            <button type="button" className="mc-remove" onClick={() => { mark(item, null); setOpen(false); }}>Remove from my library</button>
          )}
        </div>
      )}
      {err && <p className="small err" role="alert" style={{ margin: "6px 0 0" }}>{err}</p>}
    </div>
  );
}
