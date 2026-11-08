"use client";
import { useOptimistic, useState, useTransition } from "react";
import { useLib } from "@/components/cast/LibState";
import { setPriority, setRating, setStatus } from "@/app/actions";
import { PRIORITY_LABEL, STATUS_LABEL, type Item, type LibItem, type Priority, type Status } from "@/lib/types";

interface View { status: Status | null; priority: Priority; rating: number }

export default function StatusControls({ item, lib }: { item: Item; lib: LibItem | null }) {
  const [pending, start] = useTransition();
  const [v, setV] = useOptimistic<View, Partial<View>>({ status: lib?.status ?? null, priority: lib?.priority ?? "someday", rating: lib?.rating ?? 0 }, (s, p) => ({ ...s, ...p }));
  const { get, markRich } = useLib();
  const [err, setErr] = useState("");
  /** Runs one change optimistically. A failure rolls the view back (the optimistic state ends with the transition) and shows a small note instead of reaching the error boundary. */
  const run = (view: Partial<View>, save: () => Promise<unknown>, after?: () => void) => start(async () => {
    setErr(""); setV(view);
    try { await save(); after?.(); } catch { setErr("Could not save that. Check your connection and try again."); }
  });
  const choose = (status: Status | null) => {
    if (status === null && (get(item.key)?.rich || v.rating > 0) && !window.confirm(`Remove ${item.title}? Your rating and notes for it will be deleted.`)) return;
    run(status === null ? { status: null, rating: 0 } : { status }, () => setStatus({ type: item.type, id: item.id, title: item.title, year: item.year, poster: item.poster }, status));
  };
  const prioritize = (priority: Priority) => run({ priority }, () => setPriority(item.type, item.id, priority));
  const rate = (n: number) => { const next = v.rating === n ? 0 : n; run({ rating: next }, () => setRating(item.type, item.id, next), () => { if (next > 0) markRich(item.key); }); };
  return (
    <div aria-busy={pending}>
      <div className="status" role="group" aria-label="Status">
        {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
          <button key={s} className="chip" aria-pressed={v.status === s} onClick={() => choose(s)}>{STATUS_LABEL[s]}</button>
        ))}
        {v.status && <button className="chip" style={{ color: "var(--bad)" }} onClick={() => choose(null)}>Remove</button>}
        {v.status && (
          <div className="stars" role="group" aria-label="Your rating" style={{ fontSize: 20 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => rate(n)} aria-label={`${n} stars`} style={{ color: "var(--gold)" }}>{n <= v.rating ? "★" : "☆"}</button>
          ))}
        </div>
        )}
      </div>
      {v.status === "watchlist" && (
        <div className="status" role="group" aria-label="How much you want to watch it" style={{ marginTop: 0 }}>
          {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
            <button key={p} className="chip" aria-pressed={v.priority === p} onClick={() => prioritize(p)}>{PRIORITY_LABEL[p]}</button>
          ))}
        </div>
      )}
      {err && <p className="small err" role="alert" style={{ margin: "6px 0 0" }}>{err}</p>}
    </div>
  );
}
