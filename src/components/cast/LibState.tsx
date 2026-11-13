"use client";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { setStatus, setStatusMany, undoStatusMany } from "@/app/actions";
import { FranchiseSheet, type Group } from "./Franchise";
import { sameMark, unpackMarks, withPlace, withStopped, type PackedMarks } from "@/lib/marks";
import { PRIORITY_LABEL, STATUS_LABEL, markLabel, type Item, type Mark, type Priority, type Status } from "@/lib/types";

interface Ctx {
  get: (key: string) => Mark | undefined;
  /** `quiet` turns off the "related titles" suggestion that follows a Watched mark. */
  mark: (it: Item, status: Status | null, priority?: Priority, quiet?: boolean, opts?: { msg?: string }) => Promise<boolean>;
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
  /** Save a status/priority change made from the title popup: same instant, queued, undoable-on-failure path as a poster tap, but with no toast. */
  put: (it: Item, status: Status | null, priority?: Priority) => Promise<boolean>;
  /** Something other than marks changed on the server (rating, progress): server-rendered pages are refreshed once on the next navigation. */
  touch: () => void;
  /** A rating or note was saved for this title: mark it rich so removing it asks first. No-op for unmarked titles. */
  markRich: (key: string) => void;
  /** What the one-tap To watch button adds a title as. Saved on this device. */
  defaultPriority: Priority;
  /** A plain toast, with an optional Undo (used for saved places, which are not marks). */
  notify: (msg: string, undo?: () => void) => void;
  /**
   * The saved place of a series moved (null clears it): on screen only, NO server write (the caller already made its one write). It is the spoiler line
   * every surface and cache keys on. `status` is what the library holds now when that write also changed it.
   */
  setPlace: (key: string, place: { s: number; e: number } | null, status?: Status) => void;
  /** A film's stopped time moved (undefined clears it): on screen only, NO server write (the film clock made its one write). Library, Watch next and the Resume sheet read it. */
  setStopped: (key: string, min: number | undefined) => void;
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
export function LibProvider({ packed, children }: { packed: PackedMarks; children: React.ReactNode }) {
  // Unpacked once per server payload: `initial` keeps the same identity until the server sends new marks, as before.
  const initial = useMemo(() => unpackMarks(packed), [packed]);
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
  const router = useRouter();
  const pathname = usePathname();
  /** Set by any quick save. The server never re-renders after one (see "Marks and freshness" in CLAUDE.md); instead the next navigation refreshes once. */
  const dirty = useRef(false);
  const live = useRef(initial); live.current = initial;
  const overRef = useRef(over); overRef.current = over;
  const skippedRef = useRef(skipped); skippedRef.current = skipped;

  useEffect(() => {
    setOver((o) => {
      const next = { ...o }; let changed = false;
      for (const k of Object.keys(o)) if (sameMark(initial[k], o[k])) { delete next[k]; changed = true; }
      return changed ? next : o;
    });
  }, [initial]);
  useEffect(() => () => clearTimeout(timer.current), []);
  // After a burst of quick marks, the first move to another page refreshes the server-rendered data once (Library, Watch next, Continue watching),
  // after the saves have landed. Opening or closing a popup is not a page change as far as the page underneath is concerned, so it waits.
  useEffect(() => {
    if (!dirty.current) return;
    if (/^\/(title|person)\//.test(pathname) && !new URLSearchParams(window.location.search).has("full")) return;
    dirty.current = false;
    Promise.all([...saveQueue.current.values()]).then(() => router.refresh());
  }, [pathname, router]);
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
    dirty.current = true;
    setOver((o) => ({ ...o, [k]: status ? { status, priority: priority ?? prev?.priority ?? "someday", rich: prev?.rich ?? false, ...(prev?.progress ? { progress: prev.progress } : {}), ...(prev?.stopped && status !== "watched" ? { stopped: prev.stopped } : {}) } : null }));
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

  const mark = useCallback((it: Item, status: Status | null, priority?: Priority, quiet?: boolean, opts?: { msg?: string }): Promise<boolean> => {
    const k = it.key;
    const prev = (k in overRef.current ? overRef.current[k] : live.current[k]) ?? null;
    if ((prev?.status ?? null) === status && (priority === undefined || prev?.priority === priority)) return Promise.resolve(true);
    if (status === null && prev?.rich && !window.confirm(`Remove ${it.title}? Your rating and notes for it will be deleted.`)) return Promise.resolve(false);
    const saved = save(it, status, prev, priority);
    {
      const msg = status ? opts?.msg ?? `${it.title}: ${markLabel(status, priority ?? prev?.priority)}` : `Removed ${it.title}`;
      // Undo after removing a title with a rating or note cannot bring those back, so offer it only when it can.
      const canUndo = !(status === null && prev?.rich);
      // One orange pill names the change it makes. Using it applies the change and offers the way back, so you can flip back and forth
      // (To watch <-> Must watch, Watching <-> Partly watched); the button itself removes the mark.
      const flip = (cur: Mark): { label: string; run: () => void } | undefined => {
        const next: Mark | null = cur.status === "watchlist" ? { ...cur, priority: cur.priority === "must" ? "someday" : "must" }
          : cur.status === "watching" ? { ...cur, status: "partial" } : cur.status === "partial" ? { ...cur, status: "watching" } : null;
        if (!next) return undefined;
        const label = next.status === "watchlist" ? `Make ${PRIORITY_LABEL[next.priority]}` : next.status === "partial" ? `Make ${STATUS_LABEL.partial}` : `Make ${STATUS_LABEL.watching}`;
        return { label, run: () => {
          save(it, next.status, cur, next.priority);
          show({ msg: `${it.title}: ${markLabel(next.status, next.priority)}`, action: flip(next) });
        } };
      };
      const action = status ? flip({ status, priority: priority ?? prev?.priority ?? "someday", rich: false, progress: prev?.progress }) : undefined;
      const id = show({ msg, pending: true, action, undo: canUndo ? () => { setToast(null); save(it, prev?.status ?? null, status ? { status, priority: priority ?? "someday", rich: false, progress: prev?.progress } : null, prev?.priority); } : undefined });
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
    return saved;
  }, [save, show, franchise, current]);

  const touch = useCallback(() => { dirty.current = true; }, []);
  const setPlace = useCallback((key: string, place: { s: number; e: number } | null, status?: Status) => {
    const m = withPlace(current(key), place, status);
    if (m) setOver((o) => ({ ...o, [key]: m }));
  }, [current]);
  const setStopped = useCallback((key: string, min: number | undefined) => {
    const m = withStopped(current(key), min);
    if (m) setOver((o) => ({ ...o, [key]: m }));
  }, [current]);
  const put = useCallback((it: Item, status: Status | null, priority?: Priority) => {
    const prev = (it.key in overRef.current ? overRef.current[it.key] : live.current[it.key]) ?? null;
    if ((prev?.status ?? null) === status && (priority === undefined || prev?.priority === priority)) return Promise.resolve(true);
    return save(it, status, prev, priority);
  }, [save]);

  const notify = useCallback((msg: string, undo?: () => void) => {
    show({ msg, undo: undo ? () => { setToast(null); undo(); } : undefined });
  }, [show]);

  const markRich = useCallback((key: string) => {
    setOver((o) => {
      const m = key in o ? o[key] : live.current[key];
      return !m || m.rich ? o : { ...o, [key]: { ...m, rich: true } };
    });
  }, []);

  const similar = useCallback((it: Item) =>
    fetch(`/api/franchise?type=${it.type}&id=${it.id}&similar=1&v=2`).then((r) => r.json()).then((j) => (j.groups ?? []) as Group[]).catch(() => [] as Group[]), []);

  const openRelated = useCallback((it: Item) => {
    setSheet(it); // always open the popup; the sheet falls back to loosely similar titles when there is no franchise
  }, []);

  const markMany = useCallback((its: Item[], status: Status) => {
    const todo = its.filter((i) => !current(i.key));
    if (!todo.length) return;
    const row = (i: Item) => ({ type: i.type, id: i.id, title: i.title, year: i.year, poster: i.poster });
    const setMany = (list: Item[], m: Mark | null) => setOver((o) => ({ ...o, ...Object.fromEntries(list.map((i) => [i.key, m])) }));
    setMany(todo, { status, priority: "someday", rich: false });
    setStatusMany(todo.map(row), status).then((added) => {
      // The server keeps titles that were already saved; only the rows it really added are shown as marked and can be undone.
      const addedKeys = new Set(added.map((a) => `${a.type}:${a.id}`));
      const kept = todo.filter((i) => !addedKeys.has(`${i.type}:${i.id}`));
      const mine = todo.filter((i) => addedKeys.has(`${i.type}:${i.id}`));
      if (kept.length) setMany(kept, null);
      if (!mine.length) { show({ msg: "Those titles were already in your library.", err: true }); return; }
      show({
        msg: `${mine.length} ${mine.length === 1 ? "title" : "titles"}: ${STATUS_LABEL[status]}`,
        undo: () => { setToast(null); setMany(mine, null); undoStatusMany(mine.map(row), status).catch(() => { setMany(mine, { status, priority: "someday", rich: false }); show({ msg: "Could not undo. Check your connection.", err: true }); }); },
      });
    }).catch(() => { setMany(todo, null); show({ msg: "Could not save those titles. Check your connection.", err: true }); });
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
    <LibCtx.Provider value={{ get, mark, markMany, openRelated, groupsOf: franchise, marked, skipped, skip, put, touch, markRich, defaultPriority, notify, setPlace, setStopped }}>
      {children}
      {sheet && <FranchiseSheet it={sheet} load={franchise} loadSimilar={similar} onClose={() => setSheet(null)} />}
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
