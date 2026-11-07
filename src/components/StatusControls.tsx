"use client";
import { useOptimistic, useTransition } from "react";
import { setRating, setStatus } from "@/app/actions";
import { STATUS_LABEL, type Item, type LibItem, type Status } from "@/lib/types";

interface View { status: Status | null; rating: number }

export default function StatusControls({ item, lib }: { item: Item; lib: LibItem | null }) {
  const [pending, start] = useTransition();
  const [v, setV] = useOptimistic<View, Partial<View>>({ status: lib?.status ?? null, rating: lib?.rating ?? 0 }, (s, p) => ({ ...s, ...p }));
  const choose = (status: Status | null) => start(async () => {
    setV(status === null ? { status: null, rating: 0 } : { status });
    await setStatus({ type: item.type, id: item.id, title: item.title, year: item.year, poster: item.poster }, status);
  });
  const rate = (n: number) => start(async () => { const next = v.rating === n ? 0 : n; setV({ rating: next }); await setRating(item.type, item.id, next); });
  return (
    <div aria-busy={pending}>
      <div className="status" role="group" aria-label="Status">
        {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
          <button key={s} className="chip" aria-pressed={v.status === s} onClick={() => choose(s)}>{STATUS_LABEL[s]}</button>
        ))}
        {v.status && <button className="chip" style={{ color: "var(--bad)" }} onClick={() => choose(null)}>Remove</button>}
      </div>
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
