/**
 * Collects the questions asked within a short moment and sends them as ONE request (a title page asks for many glimpse notes and franchise counts at once).
 * `send` gets the distinct keys and calls `answer(key, value)` / `fail(key)` as each one is known (a streamed reply answers early ones early); keys left unanswered
 * when `send` ends, or all of them when it throws, fail. The same key asked twice in one round shares one answer. Failing a single key never touches the others.
 * Pure of the browser (timers are injectable), so it is unit tested.
 */
export interface BatchSink<V> { answer(key: string, v: V): void; fail(key: string): void }

export function createBatcher<V>(
  send: (keys: string[], sink: BatchSink<V>) => Promise<void>,
  opts: { delayMs?: number; max?: number; setTimer?: (f: () => void, ms: number) => unknown } = {},
): (key: string) => Promise<V> {
  const delay = opts.delayMs ?? 50, max = opts.max ?? 16;
  const timer = opts.setTimer ?? ((f: () => void, ms: number) => setTimeout(f, ms));
  let round = new Map<string, { p: Promise<V>; res: (v: V) => void; rej: (e: Error) => void }>();
  let armed = false;
  const flush = () => {
    armed = false;
    const mine = round; round = new Map();
    const keys = [...mine.keys()];
    for (let i = 0; i < keys.length; i += max) {
      const part = keys.slice(i, i + max);
      const open = new Set(part);
      const sink: BatchSink<V> = {
        answer: (k, v) => { if (open.delete(k)) mine.get(k)!.res(v); },
        fail: (k) => { if (open.delete(k)) mine.get(k)!.rej(new Error("batch item failed")); },
      };
      send(part, sink).catch(() => {}).finally(() => { for (const k of [...open]) sink.fail(k); });
    }
  };
  return (key) => {
    let e = round.get(key);
    if (!e) {
      let res!: (v: V) => void, rej!: (e: Error) => void;
      const p = new Promise<V>((a, b) => { res = a; rej = b; });
      e = { p, res, rej };
      round.set(key, e);
    }
    if (!armed) { armed = true; timer(flush, delay); }
    return e.p;
  };
}

/** Splits streamed text into whole lines and the unfinished rest (newline-delimited JSON arrives in arbitrary pieces). */
export function splitLines(buf: string): { lines: string[]; rest: string } {
  const parts = buf.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts.filter((l) => l.trim()), rest };
}

/** Reads a newline-delimited JSON response, handing each parsed line to `on` as it arrives; lines that do not parse are skipped. */
export async function readNdjson<T>(res: Response, on: (v: T) => void): Promise<void> {
  if (!res.ok || !res.body) throw new Error("batch failed");
  const reader = res.body.getReader(), dec = new TextDecoder();
  let rest = "";
  for (;;) {
    const { done, value } = await reader.read();
    const { lines, rest: r } = splitLines(rest + (value ? dec.decode(value, { stream: !done }) : ""));
    rest = r;
    for (const l of lines) { try { on(JSON.parse(l) as T); } catch { /* skip a broken line */ } }
    if (done) break;
  }
  if (rest.trim()) { try { on(JSON.parse(rest) as T); } catch { /* ignore */ } }
}

/** Runs `fn` over `items` with at most `n` at a time, calling `done` for each as it finishes (never throws; `fn` errors are the caller's to catch). */
export async function pool<T>(items: T[], n: number, fn: (x: T, i: number) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } }));
}
