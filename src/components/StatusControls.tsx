"use client";
import { useOptimistic, useTransition } from "react";
import { setPriority, setRating, setStatus } from "@/app/actions";
import { PRIORITY_LABEL, STATUS_LABEL, type Item, type LibItem, type Priority, type Status } from "@/lib/types";

interface View { status: Status | null; priority: Priority; rating: number }

export default function StatusControls({ item, lib }: { item: Item; lib: LibItem | null }) {
  const [pending, start] = useTransition();
  const [v, setV] = useOptimistic<View, Partial<View>>({ status: lib?.status ?? null, priority: lib?.priority ?? "someday", rating: lib?.rating ?? 0 }, (s, p) => ({ ...s, ...p }));
  const choose = (status: Status | null) => start(async () => {
    setV(status === null ? { status: null, rating: 0 } : { status });
    await setStatus({ type: item.type, id: item.id, title: item.title, year: item.year, poster: item.poster }, status);
  });
  const prioritize = (priority: Priority) => start(async () => { setV({ priority }); await setPriority(item.type, item.id, priority); });
  const rate = (n: number) => start(async () => { const next = v.rating === n ? 0 : n; setV({ rating: next }); await setRating(item.type, item.id, next); });
  return (
    <div aria-busy={pending}>
      <div className="status" role="group" aria-label="Status">
        {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
          <button key={s} className="chip" aria-pressed={v.status === s} onClick={() => choose(s)}>{STATUS_LABEL[s]}</button>
        ))}
        {v.status && <button className="chip" style={{ color: "var(--bad)" }} onClick={() => choose(null)}>Remove</button>}
      </div>
      {v.status === "watchlist" && (
        <div className="status" role="group" aria-label="How much you want to watch it" style={{ marginTop: 0 }}>
          {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
            <button key={p} className="chip" aria-pressed={v.priority === p} onClick={() => prioritize(p)}>{PRIORITY_LABEL[p]}</button>
          ))}
        </div>
      )}
      {v.status && (
        <div className="stars" role="group" aria-label="Your rating" style={{ fontSize: 24 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => rate(n)} aria-label={`${n} stars`} style={{ color: "var(--gold)" }}>{n <= v.rating ? "★" : "☆"}</button>
          ))}
        </div>
      )}
    </div>
  );
}
