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
  /** The franchise groups of a title (fetched once, a few at a time). */
  groupsOf: (it: Item) => Promise<Group[]>;
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

interface Toast { id: number; msg: string; undo?: () => void; err?: boolean; pending?: boolean; action?: { label: string; run: () => void } }

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
  const busy = useRef(0);
  const queue = useRef<(() => void)[]>([]);
  /** Saves per title run one after another, so quick changes reach the server in the order they were made. */
  const saveQueue = useRef(new Map<string, Promise<boolean>>());
  const version = useRef(new Map<string, number>());
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
      // At most three lookups at a time, so a long list of seen titles does not flood the server.
      p = new Promise<void>((go) => { if (busy.current < 3) { busy.current++; go(); } else queue.current.push(go); })
        .then(() => fetch(`/api/franchise?type=${it.type}&id=${it.id}`)).then((r) => r.json()).then((j) => (j.groups ?? []) as Group[]).catch(() => [] as Group[])
        .finally(() => { const next = queue.current.shift(); if (next) next(); else busy.current--; });
      related.current.set(it.key, p);
    }
    return p;
  }, []);
  const current = useCallback((k: string) => (k in overRef.current ? overRef.current[k] : live.current[k]) ?? null, []);

  const save = useCallback(async (it: Item, status: Status | null, prev: Mark | null, priority?: Priority) => {
    const k = it.key, v = (version.current.get(k) ?? 0) + 1;
    version.current.set(k, v);
    setOver((o) => ({ ...o, [k]: status ? { status, priority: priority ?? prev?.priority ?? "someday", rich: prev?.rich ?? false } : null }));
    const run = (saveQueue.current.get(k) ?? Promise.resolve(true)).then(async () => {
      try { await setStatus({ type: it.type, id: it.id, title: it.title, year: it.year, poster: it.poster }, status, priority); return true; }
      catch {
        // A newer change to this title has already replaced what this one showed, so only the latest one rolls back.
        if (version.current.get(k) === v) { setOver((o) => ({ ...o, [k]: prev })); show({ msg: `Could not save ${it.title}. Check your connection.`, err: true }); }
        return false;
      }
    });
    saveQueue.current.set(k, run);
    return run;
  }, [show]);

  const mark = useCallback((it: Item, status: Status | null, priority?: Priority, quiet?: boolean) => {
    const k = it.key;
    const prev = (k in overRef.current ? overRef.current[k] : live.current[k]) ?? null;
    if ((prev?.status ?? null) === status && (priority === undefined || prev?.priority === priority)) return;
    if (status === null && prev?.rich && !window.confirm(`Remove ${it.title}? Your rating and notes for it will be deleted.`)) return;
    const saved = save(it, status, prev, priority);
    {
      const msg = status ? `${it.title}: ${status === "watchlist" && priority === "must" ? PRIORITY_LABEL.must : STATUS_LABEL[status]}` : `Removed ${it.title}`;
      // Undo after removing a title with a rating or note cannot bring those back, so offer it only when it can.
      const canUndo = !(status === null && prev?.rich);
      // One orange pill names the change it makes. Using it applies the change and offers the way back, so you can flip back and forth
      // (To watch <-> Must watch, Watching <-> Partly watched); the button itself removes the mark.
      const flip = (cur: Mark): { label: string; run: () => void } | undefined => {
        const next: Mark | null = cur.status === "watchlist" ? { ...cur, priority: cur.priority === "must" ? "someday" : "must" }
          : cur.status === "watching" ? { ...cur, status: "partial" } : cur.status === "partial" ? { ...cur, status: "watching" } : null;
        if (!next) return undefined;
        const label = next.status === "watchlist" ? (next.priority === "must" ? "Make must-watch" : "Make some day") : next.status === "partial" ? "Make partly watched" : "Make watching";
        return { label, run: () => {
          save(it, next.status, cur, next.priority);
          show({ msg: `${it.title}: ${next.status === "watchlist" && next.priority === "must" ? PRIORITY_LABEL.must : STATUS_LABEL[next.status]}`, action: flip(next) });
        } };
      };
      const action = status ? flip({ status, priority: priority ?? prev?.priority ?? "someday", rich: false }) : undefined;
      const id = show({ msg, pending: true, action, undo: canUndo ? () => { setToast(null); save(it, prev?.status ?? null, status ? { status, priority: priority ?? "someday", rich: false } : null, prev?.priority); } : undefined });
      // Having watched one, offer the rest of its franchise: the toast grows a button once we know there is something to mark.
      if (status === "watched" && !quiet) franchise(it).then((groups) => {
        const left = new Set(groups.flatMap((g) => g.items).filter((i) => !current(i.key)).map((i) => i.key)).size;
        if (!left) return;
        clearTimeout(timer.current); timer.current = setTimeout(() => setToast(null), 8000);
        setToast((t) => (t && t.id === id ? { ...t, action: { label: `Mark related · ${left}`, run: () => { setToast(null); setSheet(it); } } } : t));
      });
      // The message is already up and its buttons work; this only clears the spinner. A failure shows its own error message instead.
      saved.then((ok) => { if (ok) setToast((t) => (t && t.id === id ? { ...t, pending: false } : t)); });
    }
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
    <LibCtx.Provider value={{ get, mark, markMany, openRelated, groupsOf: franchise, marked, skipped, skip, defaultPriority }}>
      {children}
      {sheet && <FranchiseSheet it={sheet} load={franchise} onClose={() => setSheet(null)} />}
      <div className="toast-slot" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast${toast.err ? " bad" : ""}`} role="status">
            <span>{toast.pending && <span className="spin" aria-hidden="true" />}{toast.msg}</span>
            {toast.undo && <button className="toast-undo plain" onClick={toast.undo}>Undo</button>}
            {toast.action && <button className="toast-undo" onClick={toast.action.run}>{toast.action.label}</button>}
          </div>
        )}
      </div>
    </LibCtx.Provider>
  );
}
