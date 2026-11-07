"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { setStatus } from "@/app/actions";
import { STATUS_LABEL, type Item, type Mark, type Status } from "@/lib/types";

interface Ctx { get: (key: string) => Mark | undefined; mark: (it: Item, status: Status | null) => void }
const LibCtx = createContext<Ctx | null>(null);

export function useLib() {
  const c = useContext(LibCtx);
  if (!c) throw new Error("useLib outside LibProvider");
  return c;
}

interface Toast { id: number; msg: string; undo?: () => void; err?: boolean }

/**
 * Holds the user's marks for the cast tab. Marks change instantly on screen, are saved in the background,
 * and every change can be undone from the toast. Server data replaces local guesses once it agrees with them.
 */
export function LibProvider({ initial, children }: { initial: Record<string, Mark>; children: React.ReactNode }) {
  const [over, setOver] = useState<Record<string, Mark | null>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const live = useRef(initial); live.current = initial;
  const overRef = useRef(over); overRef.current = over;

  useEffect(() => {
    setOver((o) => {
      const next = { ...o }; let changed = false;
      for (const k of Object.keys(o)) if ((initial[k]?.status ?? null) === (o[k]?.status ?? null)) { delete next[k]; changed = true; }
      return changed ? next : o;
    });
  }, [initial]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const get = useCallback((key: string) => (key in over ? over[key] ?? undefined : initial[key]), [over, initial]);

  const show = useCallback((t: Omit<Toast, "id">) => {
    clearTimeout(timer.current);
    setToast({ ...t, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), t.undo ? 5000 : 3500);
  }, []);

  const save = useCallback(async (it: Item, status: Status | null, prev: Mark | null) => {
    setOver((o) => ({ ...o, [it.key]: status ? { status, rich: prev?.rich ?? false } : null }));
    try { await setStatus({ type: it.type, id: it.id, title: it.title, year: it.year, poster: it.poster }, status); return true; }
    catch {
      setOver((o) => ({ ...o, [it.key]: prev }));
      show({ msg: `Could not save ${it.title}. Check your connection.`, err: true });
      return false;
    }
  }, [show]);

  const mark = useCallback((it: Item, status: Status | null) => {
    const k = it.key;
    const prev = (k in overRef.current ? overRef.current[k] : live.current[k]) ?? null;
    if ((prev?.status ?? null) === status) return;
    if (status === null && prev?.rich && !window.confirm(`Remove ${it.title}? Your rating and notes for it will be deleted.`)) return;
    save(it, status, prev).then((ok) => {
      if (!ok) return;
      const msg = status ? `${it.title}: ${STATUS_LABEL[status]}` : `Removed ${it.title}`;
      // Undo after removing a title with a rating or note cannot bring those back, so offer it only when it can.
      const canUndo = !(status === null && prev?.rich);
      show({ msg, undo: canUndo ? () => { setToast(null); save(it, prev?.status ?? null, status ? { status, rich: false } : null); } : undefined });
    });
  }, [save, show]);

  return (
    <LibCtx.Provider value={{ get, mark }}>
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
