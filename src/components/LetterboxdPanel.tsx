"use client";
import { useState, useTransition } from "react";
import { connectLetterboxd, disconnectLetterboxd, importLetterboxd, syncLetterboxdNow } from "@/app/actions";
import { buildEntries, readZip, type LbEntry } from "@/lib/letterboxd-parse";
import type { LetterboxdLink } from "@/lib/types";

const BATCH = 25;

/** Two independent, opt-in tools: a one-time import of a Letterboxd export, and a connection that pulls new diary entries. */
export default function LetterboxdPanel({ link }: { link: LetterboxdLink | null }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<LbEntry[] | null>(null);
  const [readErr, setReadErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [tally, setTally] = useState<{ added: number; updated: number; unmatched: string[] } | null>(null);
  const [importErr, setImportErr] = useState("");

  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  async function pick(files: FileList | null) {
    setEntries(null); setTally(null); setReadErr(""); setImportErr("");
    if (!files?.length) return;
    try {
      const texts: { name: string; text: string }[] = [];
      for (const f of Array.from(files)) {
        if (f.name.toLowerCase().endsWith(".zip")) texts.push(...(await readZip(await f.arrayBuffer())));
        else texts.push({ name: f.name, text: await f.text() });
      }
      const all = buildEntries(texts);
      if (!all.length) setReadErr("No films found. Choose the .zip you downloaded from Letterboxd (Settings, Data, Export your data), or its watched.csv, ratings.csv, diary.csv and watchlist.csv.");
      else setEntries(all);
    } catch (e) { setReadErr((e as Error).message || "Could not read that file."); }
  }

  async function run() {
    if (!entries) return;
    setBusy(true); setDone(0); setImportErr(""); setTally(null);
    const sum = { added: 0, updated: 0, unmatched: [] as string[] };
    try {
      for (let i = 0; i < entries.length; i += BATCH) {
        const r = await importLetterboxd(entries.slice(i, i + BATCH), i + BATCH >= entries.length);
        sum.added += r.added; sum.updated += r.updated; sum.unmatched.push(...r.unmatched);
        setDone(Math.min(entries.length, i + BATCH)); setTally({ ...sum });
      }
      setEntries(null);
    } catch { setImportErr("The import stopped part way. Choose the file again to resume: films already imported are skipped."); }
    setBusy(false);
  }

  function connect() { setErr(""); setMsg(""); start(async () => { const r = await connectLetterboxd(name); if (r.ok) { setMsg(`Connected. ${r.added} added, ${r.updated} updated.`); setName(""); } else setErr(r.error); }); }
  function syncNow() { setErr(""); setMsg(""); start(async () => { const r = await syncLetterboxdNow(); if (r.ok) setMsg(r.added + r.updated ? `${r.added} added, ${r.updated} updated.` : "Up to date."); else setErr(r.error); }); }
  function disconnect() { setErr(""); setMsg(""); start(async () => { await disconnectLetterboxd(); }); }

  const watched = entries?.filter((e) => e.watched).length ?? 0, listed = entries?.filter((e) => e.watchlist).length ?? 0, rated = entries?.filter((e) => e.rating > 0).length ?? 0;
  const shown = open || !!link;
  return (
    <>
      <h2>Services you can add</h2>
      <div className="card pad" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>Letterboxd</b>
          <div className="small muted">{link ? `Connected as ${link.user}` : "Optional. Bring over your watched films, or keep new ones in sync."}</div>
        </div>
        {!link && <button className="btn sm" type="button" aria-expanded={shown} disabled={busy} onClick={() => setOpen(!open)}>{open ? "Hide" : "Add"}</button>}
      </div>
      {shown && <div className="sp" />}
      {shown && <div className="card pad" aria-busy={busy}>
        <label className="l" htmlFor="lbf">Import your Letterboxd history</label>
        <p className="small muted" style={{ margin: "0 0 10px" }}>One time, and only if you want it. On Letterboxd open Settings, then Data, then Export your data. Choose the .zip you get (or its CSV files) here. Nothing is sent until you press Import.</p>
        <input id="lbf" type="file" accept=".zip,.csv,application/zip,text/csv" multiple disabled={busy} onChange={(e) => pick(e.target.files)} />
        {readErr && <p className="small err" style={{ margin: "10px 0 0" }}>{readErr}</p>}
        {entries && !busy && (
          <>
            <p className="small" style={{ margin: "10px 0" }}>Found {watched} watched ({rated} rated) and {listed} on your watchlist.</p>
            <button className="btn gold" type="button" onClick={run}>Import</button>
          </>
        )}
        {busy && entries && <p className="small muted" style={{ margin: "10px 0 0" }}><span className="spin" />Importing {done} of {entries.length}. Keep this page open.</p>}
        {tally && !busy && (
          <p className="small" style={{ margin: "10px 0 0" }}>Done: {tally.added} added, {tally.updated} updated{tally.unmatched.length ? `, ${tally.unmatched.length} not found on TMDB` : ""}.</p>
        )}
        {importErr && <p className="small err" style={{ margin: "10px 0 0" }}>{importErr}</p>}
        {tally && tally.unmatched.length > 0 && !busy && (
          <details style={{ marginTop: 8 }}><summary className="small muted">Titles that could not be matched</summary>
            <ul className="small muted" style={{ margin: "6px 0 0", paddingLeft: 18 }}>{tally.unmatched.map((u) => <li key={u}>{u}</li>)}</ul>
          </details>
        )}
        <p className="small muted" style={{ margin: "10px 0 0" }}>Titles you already have are never overwritten: an existing title is only marked watched if it was not, and given a rating only if it had none. Half stars are rounded up to whole stars. Films only; TV is not on Letterboxd.</p>
      </div>}
      {shown && <div className="sp" />}
      {shown && <div className="card pad" aria-busy={pending}>
        <label className="l" htmlFor="lbu">Keep in sync</label>
        {link ? (
          <>
            <p className="small" style={{ margin: "0 0 10px" }}>Connected to <b>{link.user}</b>. {link.syncedAt ? <>Last checked <span suppressHydrationWarning>{new Date(link.syncedAt).toLocaleString()}</span>.</> : "Not checked yet."}</p>
            <div className="chips">
              <button className="btn" type="button" onClick={syncNow} disabled={pending}>{pending ? "Checking…" : "Sync now"}</button>
              <button className="btn" type="button" onClick={disconnect} disabled={pending}>Disconnect</button>
            </div>
            {link.error && <p className="small err" style={{ margin: "10px 0 0" }}>{link.error}</p>}
          </>
        ) : (
          <>
            <p className="small muted" style={{ margin: "0 0 10px" }}>Optional. Enter your Letterboxd username and new films from your diary are added as Watched, with your rating and watched date. Typecast checks when you open it, at most every 6 hours.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input id="lbu" type="text" placeholder="Letterboxd username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && connect()} style={{ flex: 1 }} />
              <button className="btn gold" type="button" onClick={connect} disabled={pending || !name.trim()}>{pending ? "Connecting…" : "Connect"}</button>
            </div>
          </>
        )}
        {msg && <p className="small" style={{ margin: "10px 0 0" }}>{msg}</p>}
        {!link && err && <p className="small err" style={{ margin: "10px 0 0" }}>{err}</p>}
        {link && err && !link.error && <p className="small err" style={{ margin: "10px 0 0" }}>{err}</p>}
        <p className="small muted" style={{ margin: "10px 0 0" }}>Needs a public profile. Only films you log in your Letterboxd diary come through (about the latest 50 are visible to a sync, which is plenty to stay current). Syncing is one way: nothing is written back to Letterboxd. Disconnecting keeps what was imported.</p>
      </div>}
    </>
  );
}
