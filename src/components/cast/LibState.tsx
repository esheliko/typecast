"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { setStatus, setStatusMany, undoStatusMany } from "@/app/actions";
import { FranchiseSheet, type Group } from "./Franchise";
import { PRIORITY_LABEL, STATUS_LABEL, type Item, type Mark, type Priority, type Status } from "@/lib/types";

interface Ctx {
  get: (key: string) => Mark | undefined;
  /** `quiet` turns off the "related titles" suggestion that follows a Watched mark. */
  mark: (it: Item, status: Status | null, priority?: Priority, quiet?: boolean) => void;
  /** Mark several unmarked titles at once, with one Undo. */
  markMany: (its: Item[], status: Status) => void;
  /** Open the franchise sheet for a title; says so in a toast instead when it has no related titles. */
  openRelated: (it: Item) => void;
  /** Keys marked right now. Browse snapshots this when it opens: it hides those, but not titles marked later in the visit, so the grid does not shift under your thumb. */
  marked: () => Set<string>;
  /** Titles skipped with "Not interested". Saved on this device. */
  skipped: ReadonlySet<string>;
  skip: (it: Item) => void;
  /** What the one-tap To watch button adds a title as. Saved on this device. */
  defaultPriority: Priority;
}
const LibCtx = createContext<Ctx | null>(null);

export function useLib() {
  const c = useContext(LibCtx);
  if (!c) throw new Error("useLib outside LibProvider");
  return c;
}

const SKIP_KEY = "typecast.skipped";
const SKIP_MAX = 3000;
export const PRIO_KEY = "typecast.defaultPriority";

interface Toast { id: number; msg: string; undo?: () => void; err?: boolean; action?: { label: string; run: () => void } }

/**
 * Holds the user's marks for the cast tab. Marks change instantly on screen, are saved in the background,
 * and every change can be undone from the toast. Server data replaces local guesses once it agrees with them.
 */
export function LibProvider({ initial, children }: { initial: Record<string, Mark>; children: React.ReactNode }) {
  const [over, setOver] = useState<Record<string, Mark | null>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const [defaultPriority, setDefaultPriority] = useState<Priority>("someday");
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [sheet, setSheet] = useState<Item | null>(null);
  const related = useRef(new Map<string, Promise<Group[]>>());
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
    try { if (localStorage.getItem(PRIO_KEY) === "must") setDefaultPriority("must"); } catch { /* storage unavailable */ }
  }, []);

  const marked = useCallback(() => {
    const keys = new Set(Object.keys(live.current));
    for (const [k, v] of Object.entries(overRef.current)) { if (v) keys.add(k); else keys.delete(k); }
    return keys;
  }, []);

  const get = useCallback((key: string) => (key in over ? over[key] ?? undefined : initial[key]), [over, initial]);

  const show = useCallback((t: Omit<Toast, "id">) => {
    clearTimeout(timer.current);
    const id = Date.now() + Math.random();
    setToast({ ...t, id });
    timer.current = setTimeout(() => setToast(null), t.undo || t.action ? 5000 : 3500);
    return id;
  }, []);

  /** The groups of titles that belong with `it`, fetched once per title. */
  const franchise = useCallback((it: Item) => {
    let p = related.current.get(it.key);
    if (!p) {
      p = fetch(`/api/franchise?type=${it.type}&id=${it.id}`).then((r) => r.json()).then((j) => (j.groups ?? []) as Group[]).catch(() => [] as Group[]);
      related.current.set(it.key, p);
    }
    return p;
  }, []);
  const current = useCallback((k: string) => (k in overRef.current ? overRef.current[k] : live.current[k]) ?? null, []);

  const save = useCallback(async (it: Item, status: Status | null, prev: Mark | null, priority?: Priority) => {
    setOver((o) => ({ ...o, [it.key]: status ? { status, priority: priority ?? prev?.priority ?? "someday", rich: prev?.rich ?? false } : null }));
    try { await setStatus({ type: it.type, id: it.id, title: it.title, year: it.year, poster: it.poster }, status, priority); return true; }
    catch {
      setOver((o) => ({ ...o, [it.key]: prev }));
      show({ msg: `Could not save ${it.title}. Check your connection.`, err: true });
      return false;
    }
  }, [show]);

  const mark = useCallback((it: Item, status: Status | null, priority?: Priority, quiet?: boolean) => {
    const k = it.key;
    const prev = (k in overRef.current ? overRef.current[k] : live.current[k]) ?? null;
    if ((prev?.status ?? null) === status && (priority === undefined || prev?.priority === priority)) return;
    if (status === null && prev?.rich && !window.confirm(`Remove ${it.title}? Your rating and notes for it will be deleted.`)) return;
    save(it, status, prev, priority).then((ok) => {
      if (!ok) return;
      const msg = status ? `${it.title}: ${status === "watchlist" && priority === "must" ? PRIORITY_LABEL.must : STATUS_LABEL[status]}` : `Removed ${it.title}`;
      // Undo after removing a title with a rating or note cannot bring those back, so offer it only when it can.
      const canUndo = !(status === null && prev?.rich);
      // Right after adding to the list, offer the other priority so one button is enough.
      const other: Priority | null = status === "watchlist" ? (priority ?? prev?.priority ?? "someday") === "must" ? "someday" : "must" : null;
      const action = other ? { label: other === "must" ? "Make must-watch" : "Make some day", run: () => { setToast(null); save(it, "watchlist", { status: "watchlist", priority: priority ?? prev?.priority ?? "someday", rich: false }, other); } } : undefined;
      const id = show({ msg, action, undo: canUndo ? () => { setToast(null); save(it, prev?.status ?? null, status ? { status, priority: priority ?? "someday", rich: false } : null, prev?.priority); } : undefined });
      // Having watched one, offer the rest of its franchise: the toast grows a button once we know there is something to mark.
      if (status === "watched" && !quiet) franchise(it).then((groups) => {
        const left = new Set(groups.flatMap((g) => g.items).filter((i) => !current(i.key)).map((i) => i.key)).size;
        if (!left) return;
        clearTimeout(timer.current); timer.current = setTimeout(() => setToast(null), 8000);
        setToast((t) => (t && t.id === id ? { ...t, action: { label: `Mark related · ${left}`, run: () => { setToast(null); setSheet(it); } } } : t));
      });
    });
  }, [save, show, franchise, current]);

  const openRelated = useCallback((it: Item) => {
    franchise(it).then((g) => { if (g.length) setSheet(it); else show({ msg: `No related titles found for ${it.title}` }); });
  }, [franchise, show]);

  const markMany = useCallback((its: Item[], status: Status) => {
    const todo = its.filter((i) => !current(i.key));
    if (!todo.length) return;
    const row = (i: Item) => ({ type: i.type, id: i.id, title: i.title, year: i.year, poster: i.poster });
    const put = (list: Item[], m: Mark | null) => setOver((o) => ({ ...o, ...Object.fromEntries(list.map((i) => [i.key, m])) }));
    put(todo, { status, priority: "someday", rich: false });
    setStatusMany(todo.map(row), status).then(() => {
      show({
        msg: `${todo.length} ${todo.length === 1 ? "title" : "titles"}: ${STATUS_LABEL[status]}`,
        undo: () => { setToast(null); put(todo, null); undoStatusMany(todo.map(row), status).catch(() => { put(todo, { status, priority: "someday", rich: false }); show({ msg: "Could not undo. Check your connection.", err: true }); }); },
      });
    }).catch(() => { put(todo, null); show({ msg: "Could not save those titles. Check your connection.", err: true }); });
  }, [current, show]);

  const writeSkipped = useCallback((next: Set<string>) => {
    setSkipped(next);
    try { localStorage.setItem(SKIP_KEY, JSON.stringify([...next].slice(-SKIP_MAX))); } catch { /* storage unavailable */ }
  }, []);
  const skip = useCallback((it: Item) => {
    const next = new Set(skippedRef.current); next.add(it.key); skippedRef.current = next; writeSkipped(next);
    show({ msg: `Hidden: ${it.title}`, undo: () => { setToast(null); const u = new Set(skippedRef.current); u.delete(it.key); skippedRef.current = u; writeSkipped(u); } });
  }, [show, writeSkipped]);

  return (
    <LibCtx.Provider value={{ get, mark, markMany, openRelated, marked, skipped, skip, defaultPriority }}>
      {children}
      {sheet && <FranchiseSheet it={sheet} load={franchise} onClose={() => setSheet(null)} />}
      <div className="toast-slot" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast${toast.err ? " bad" : ""}`} role="status">
            <span>{toast.msg}</span>
            {toast.undo && <button className="toast-undo plain" onClick={toast.undo}>Undo</button>}
            {toast.action && <button className="toast-undo" onClick={toast.action.run}>{toast.action.label}</button>}
          </div>
        )}
      </div>
    </LibCtx.Provider>
  );
}
