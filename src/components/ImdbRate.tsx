"use client";
import { useEffect, useState } from "react";

// One shared cache and a tiny batcher: every rating on screen asks in the same tick, the server answers once.
const known = new Map<string, number | null>();
const waiting = new Map<string, ((n: number | null) => void)[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const batch = [...waiting.entries()];
  waiting.clear();
  for (let i = 0; i < batch.length; i += 40) {
    const part = batch.slice(i, i + 40);
    fetch(`/api/imdb?k=${part.map(([k]) => k).join(",")}`)
      .then((r) => (r.ok ? r.json() : {}), () => ({}))
      .then((d: Record<string, number>) => { for (const [k, cbs] of part) { const v = d[k] ?? null; known.set(k, v); cbs.forEach((cb) => cb(v)); } });
  }
}

function ask(k: string, cb: (n: number | null) => void) {
  const list = waiting.get(k) ?? [];
  list.push(cb);
  waiting.set(k, list);
  if (!timer) timer = setTimeout(flush, 30);
}

/** "IMDb 7.8" for a film or series key like "movie:603", with `lead` before it (e.g. " · "). Renders nothing until IMDb answers, and nothing when it has no score. */
export function ImdbRate({ k, lead = "" }: { k: string; lead?: string }) {
  const [v, setV] = useState<number | null>(known.get(k) ?? null);
  useEffect(() => {
    if (known.has(k)) { setV(known.get(k) ?? null); return; }
    let live = true;
    ask(k, (n) => { if (live) setV(n); });
    return () => { live = false; };
  }, [k]);
  return v ? <>{lead}IMDb {v.toFixed(1)}</> : null;
}
