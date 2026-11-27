/**
 * A tiny in-memory map whose entries expire after `ttlMs` and that never holds more than `max` of them (oldest dropped first).
 * Used to keep an expensive per-visit result (the ranked "For you" order) for the few minutes its later pages are asked for.
 * Per server instance only: a miss just means the result is computed again, so callers must never depend on a hit.
 */
export function createTtlMemo<V>(ttlMs: number, max: number, now: () => number = Date.now) {
  const m = new Map<string, { v: V; at: number }>();
  const sweep = () => { const t = now(); for (const [k, e] of m) if (t - e.at >= ttlMs) m.delete(k); };
  return {
    get(k: string): V | undefined {
      const e = m.get(k);
      if (!e) return undefined;
      if (now() - e.at >= ttlMs) { m.delete(k); return undefined; }
      return e.v;
    },
    set(k: string, v: V) {
      m.delete(k);
      m.set(k, { v, at: now() });
      if (m.size > max) { sweep(); while (m.size > max) m.delete(m.keys().next().value as string); }
    },
    delete(k: string) { m.delete(k); },
    get size() { return m.size; },
  };
}
