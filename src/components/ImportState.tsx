"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { importLetterboxd, rollbackImport } from "@/app/actions";
import { readZip } from "@/lib/letterboxd-parse";
import { parseAny, type Plain } from "@/lib/list-parse";
import type { Applied } from "@/lib/letterboxd";
import ImportReviewDialog, { toRows, type ReviewRow } from "./ImportReview";

const BATCH = 25;

type Entries = ReturnType<typeof parseAny>;
type Tally = { added: number; updated: number; unmatched: number; failed: number };

type Ctx = {
  entries: Entries | null;
  pasted: string; setPasted: (v: string) => void;
  plain: Plain; setPlain: (v: Plain) => void;
  fileKey: number; picked: boolean;
  readErr: string; importErr: string; reverted: string;
  busy: boolean; done: number; tally: Tally | null;
  review: ReviewRow[]; openReview: () => void;
  pick: (files: FileList | null) => Promise<void>;
  run: () => Promise<void>;
};

const ImportCtx = createContext<Ctx | null>(null);
export const useImport = () => {
  const c = useContext(ImportCtx);
  if (!c) throw new Error("useImport needs <ImportProvider>");
  return c;
};

/**
 * Owns the import (the chosen list, the running batch loop, the review). It lives in the app layout, not on the Settings page, so
 * switching tabs neither stops an import nor loses its review.
 */
export function ImportProvider({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [raw, setRaw] = useState<{ name: string; text: string }[] | null>(null);
  const [pasted, setPastedRaw] = useState("");
  const [plain, setPlain] = useState<Plain>("watched");
  const [fileKey, setFileKey] = useState(0);
  const [picked, setPicked] = useState(false);
  const sources = useMemo(() => [...(raw ?? []), ...(pasted.trim() ? [{ name: "pasted.txt", text: pasted }] : [])], [raw, pasted]);
  const parsed = useMemo(() => (sources.length ? parseAny(sources, plain) : []), [sources, plain]);
  const [started, setStarted] = useState<Entries | null>(null);
  const entries = started ?? (parsed.length ? parsed : null);
  const [readErr, setReadErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [tally, setTally] = useState<Tally | null>(null);
  const [review, setReview] = useState<ReviewRow[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reverted, setReverted] = useState("");
  const [importErr, setImportErr] = useState("");

  // A reload or closing the tab does stop an import; switching tabs inside the app does not.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  function setPasted(v: string) { setPastedRaw(v); setTally(null); setImportErr(""); }

  async function pick(files: FileList | null) {
    setRaw(null); setTally(null); setReadErr(""); setImportErr(""); setPicked(false);
    if (!files?.length) return;
    try {
      const texts: { name: string; text: string }[] = [];
      for (const f of Array.from(files)) {
        if (f.name.toLowerCase().endsWith(".zip")) texts.push(...(await readZip(await f.arrayBuffer())));
        else texts.push({ name: f.name, text: await f.text() });
      }
      setRaw(texts); setPicked(true);
    } catch (e) { setReadErr((e as Error).message || "Could not read that file."); }
  }

  async function run() {
    if (!entries) return;
    setBusy(true); setDone(0); setImportErr(""); setReverted(""); setTally(null); setStarted(entries); setReview([]); setReviewOpen(false);
    const sum = { added: 0, updated: 0, unmatched: 0, failed: 0 }, all: ReviewRow[] = [], applied: Applied[] = [];
    let at = 0;
    try {
      for (let i = 0; i < entries.length; i += BATCH) {
        at = i;
        const r = await importLetterboxd(entries.slice(i, i + BATCH), i + BATCH >= entries.length);
        applied.push(...r.items);
        sum.added += r.added; sum.updated += r.updated; sum.unmatched += r.unmatched.length; sum.failed += r.failed.length; all.push(...toRows(r.items, r.unmatched, r.failed));
        setDone(Math.min(entries.length, i + BATCH)); setTally({ ...sum }); setReview([...all].sort((a, b) => Number(!!b.problem) - Number(!!a.problem)));
      }
      setRaw(null); setPastedRaw(""); setFileKey((k) => k + 1); setPicked(false);
      if (all.length) setReviewOpen(true);
    } catch (e) {
      // The import itself broke (connection lost, signed out). Keep nothing from it: remove what earlier batches added and restore what they changed.
      setTally(null); setReview([]);
      const raw = e instanceof Error ? e.message : String(e);
      const why = /fetch|network|load failed/i.test(raw) ? "the connection dropped" : /unauthor|sign|auth/i.test(raw) ? "you were signed out" : raw.slice(0, 160) || "an unknown error";
      const where = `It stopped around line ${at + 1} of ${entries.length} because ${why}.`;
      console.error("[import] stopped", e);
      try { await rollbackImport(applied); setImportErr(`${where} Nothing from it was kept, so your library is as it was. Your list is still here: press Import to try again.`); }
      catch { setImportErr(`${where} The undo did not finish, so some titles may have been added. Press Import again: titles already added are skipped, and nothing is added twice.`); }
    }
    setStarted(null); setBusy(false);
  }

  /** Reverse the whole import: remove what it added, restore what it changed (including fixes made in the review). */
  async function revertAll() {
    const undo = review.flatMap((r) => r.recs);
    await rollbackImport(undo);
    const added = review.filter((r) => r.item && r.isNew && !r.problem && !r.gone).length;
    setReview([]); setTally(null); setReviewOpen(false);
    setReverted(`Import reverted: ${added} added title${added === 1 ? "" : "s"} removed${undo.some((x) => !x.isNew && x.prev) ? " and changed titles restored" : ""}. Your library is as it was before.`);
  }

  const value: Ctx = { entries, pasted, setPasted, plain, setPlain, fileKey, picked, readErr, importErr, reverted, busy, done, tally, review, openReview: () => setReviewOpen(true), pick, run };
  const problems = review.filter((r) => r.problem && !r.gone).length;
  // Off the Settings page, a small bar keeps the import visible and gets back to its review.
  const bar = path !== "/setup" && (busy || (review.length > 0 && !reviewOpen));
  return (
    <ImportCtx.Provider value={value}>
      {children}
      {bar && (
        <div className="toast-slot" role="status">
          <div className="toast">
            {busy
              ? <span><span className="spin" />Importing {done} of {entries?.length ?? 0}…</span>
              : <><span>Import finished{problems ? `: ${problems} to fix` : ""}</span><button type="button" className="toast-undo" onClick={() => setReviewOpen(true)}>Review</button></>}
            {busy && <Link href="/setup" className="toast-undo plain">Details</Link>}
          </div>
        </div>
      )}
      {reviewOpen && review.length > 0 && !busy && <ImportReviewDialog rows={review} onChange={setReview} onClose={() => setReviewOpen(false)} onRevert={revertAll} />}
    </ImportCtx.Provider>
  );
}
