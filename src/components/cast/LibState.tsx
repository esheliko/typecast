"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { setStatus } from "@/app/actions";
import { PRIORITY_LABEL, STATUS_LABEL, type Item, type Mark, type Priority, type Status } from "@/lib/types";

interface Ctx {
  get: (key: string) => Mark | undefined;
  mark: (it: Item, status: Status | null, priority?: Priority) => void;
  /** Keys marked right now. Browse snapshots this when it opens: it hides those, but not titles marked later in the visit, so the grid does not shift under your thumb. */
  marked: () => Set<string>;
  /** Titles skipped with "Not interested". Saved on this device. */
  skipped: ReadonlySet<string>;
  skip: (it: Item) => void;
}
const LibCtx = createContext<Ctx | null>(null);

export function useLib() {
  const c = useContext(LibCtx);
  if (!c) throw new Error("useLib outside LibProvider");
  return c;
}

const SKIP_KEY = "typecast.skipped";
const SKIP_MAX = 3000;

interface Toast { id: number; msg: string; undo?: () => void; err?: boolean }

/**
 * Holds the user's marks for the cast tab. Marks change instantly on screen, are saved in the background,
 * and every change can be undone from the toast. Server data replaces local guesses once it agrees with them.
 */
export function LibProvider({ initial, children }: { initial: Record<string, Mark>; children: React.ReactNode }) {
  const [over, setOver] = useState<Record<string, Mark | null>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const live = useRef(initial); live.current = initial;
  const overRef = useRef(over); overRef.current = over;
  const skippedRef = useRef(skipped); skippedRef.current = skipped;

  useEffect(() => {
    setOver((o) => {
      const next = { ...o }; let changed = false;
      for (const k of Object.keys(o)) if ((initial[k]?.status ?? null) === (o[k]?.status ?? null) && initial[k]?.priority === o[k]?.priority) { delete next[k]; changed = true; }
      return changed ? next : o;
    });
  }, [initial]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    try { const raw = JSON.parse(localStorage.getItem(SKIP_KEY) ?? "[]"); if (Array.isArray(raw)) setSkipped(new Set(raw.filter((x) => typeof x === "string"))); } catch { /* storage unavailable */ }
  }, []);

  const marked = useCallback(() => {
    const keys = new Set(Object.keys(live.current));
    for (const [k, v] of Object.entries(overRef.current)) { if (v) keys.add(k); else keys.delete(k); }
    return keys;
  }, []);

  const get = useCallback((key: string) => (key in over ? over[key] ?? undefined : initial[key]), [over, initial]);

  const show = useCallback((t: Omit<Toast, "id">) => {
    clearTimeout(timer.current);
    setToast({ ...t, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), t.undo ? 5000 : 3500);
  }, []);

  const save = useCallback(async (it: Item, status: Status | null, prev: Mark | null, priority?: Priority) => {
    setOver((o) => ({ ...o, [it.key]: status ? { status, priority: priority ?? prev?.priority ?? "someday", rich: prev?.rich ?? false } : null }));
    try { await setStatus({ type: it.type, id: it.id, title: it.title, year: it.year, poster: it.poster }, status, priority); return true; }
    catch {
      setOver((o) => ({ ...o, [it.key]: prev }));
      show({ msg: `Could not save ${it.title}. Check your connection.`, err: true });
      return false;
    }
  }, [show]);

  const mark = useCallback((it: Item, status: Status | null, priority?: Priority) => {
    const k = it.key;
    const prev = (k in overRef.current ? overRef.current[k] : live.current[k]) ?? null;
    if ((prev?.status ?? null) === status && (priority === undefined || prev?.priority === priority)) return;
    if (status === null && prev?.rich && !window.confirm(`Remove ${it.title}? Your rating and notes for it will be deleted.`)) return;
    save(it, status, prev, priority).then((ok) => {
      if (!ok) return;
      const msg = status ? `${it.title}: ${status === "watchlist" && priority === "must" ? PRIORITY_LABEL.must : STATUS_LABEL[status]}` : `Removed ${it.title}`;
      // Undo after removing a title with a rating or note cannot bring those back, so offer it only when it can.
      const canUndo = !(status === null && prev?.rich);
      show({ msg, undo: canUndo ? () => { setToast(null); save(it, prev?.status ?? null, status ? { status, priority: priority ?? "someday", rich: false } : null, prev?.priority); } : undefined });
    });
  }, [save, show]);

  const writeSkipped = useCallback((next: Set<string>) => {
    setSkipped(next);
    try { localStorage.setItem(SKIP_KEY, JSON.stringify([...next].slice(-SKIP_MAX))); } catch { /* storage unavailable */ }
  }, []);
  const skip = useCallback((it: Item) => {
    const next = new Set(skippedRef.current); next.add(it.key); skippedRef.current = next; writeSkipped(next);
    show({ msg: `Hidden: ${it.title}`, undo: () => { setToast(null); const u = new Set(skippedRef.current); u.delete(it.key); skippedRef.current = u; writeSkipped(u); } });
  }, [show, writeSkipped]);

  return (
    <LibCtx.Provider value={{ get, mark, marked, skipped, skip }}>
      {children}
      <div className="toast-slot" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast${toast.err ? " bad" : ""}`} role="status">
            <span>{toast.msg}</span>
            {toast.undo && <button className="toast-undo" onClick={toast.undo}>Undo</button>}
          </div>
        )}
      </div>
    </LibCtx.Provider>
  );
}
