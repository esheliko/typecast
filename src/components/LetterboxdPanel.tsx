"use client";
import { useState, useTransition } from "react";
import { connectLetterboxd, disconnectLetterboxd, syncLetterboxdNow } from "@/app/actions";
import type { Plain } from "@/lib/list-parse";
import SettingRow from "./SettingRow";
import { useImport } from "./ImportState";
import { unsaved } from "./ImportReview";
import type { LetterboxdLink } from "@/lib/types";

/** Two independent, opt-in tools: a one-time import of a Letterboxd export, and a connection that pulls new diary entries. */
export default function LetterboxdPanel({ link }: { link: LetterboxdLink | null }) {
  const { entries, pasted, setPasted, plain, setPlain, fileKey, picked, readErr, importErr, reverted, busy, done, tally, review, openReview, pick, run } = useImport();

  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  function connect() { setErr(""); setMsg(""); start(async () => { const r = await connectLetterboxd(name); if (r.ok) { setMsg(`Connected. ${r.added} added, ${r.updated} updated.`); setName(""); } else setErr(r.error); }); }
  function syncNow() { setErr(""); setMsg(""); start(async () => { const r = await syncLetterboxdNow(); if (r.ok) setMsg(r.added + r.updated ? `${r.added} added, ${r.updated} updated.` : "Up to date."); else setErr(r.error); }); }
  function disconnect() { setErr(""); setMsg(""); start(async () => { await disconnectLetterboxd(); }); }

  const watched = entries?.filter((e) => e.watched).length ?? 0, listed = entries?.filter((e) => e.watchlist).length ?? 0, watchingN = entries?.filter((e) => e.watching).length ?? 0, rated = entries?.filter((e) => e.rating > 0).length ?? 0;
  return (
    <>
      <SettingRow label="Import a list" value={busy && entries ? `Importing ${done} of ${entries.length}` : review.some((r) => unsaved(r) && !r.gone) ? "Needs review" : tally ? "Done" : undefined}>
      {(close) => <div aria-busy={busy}>
        <details className="small muted" style={{ margin: "0 0 10px" }} open>
          <summary style={{ cursor: "pointer" }}>Formats</summary>
          <p style={{ margin: "6px 0 0" }}>Letterboxd .zip or CSV (Settings, Data, Export), or text with a title per line. Checklists work: <b>[x]</b> watched, <b>[ ]</b> to watch, trailing <b>WIP</b> watching. Add a year (2019) or rating (4/5, ★★★★) if you have one. Existing titles are never overwritten.</p>
        </details>
        <input id="lbf" key={fileKey} type="file" accept=".zip,.csv,.txt,.md,.text,application/zip,text/csv,text/plain" multiple disabled={busy} onChange={(e) => pick(e.target.files)} />
        <textarea aria-label="Paste a list" placeholder={"Or paste a list:\n[x] Inception (2010)\n[ ] Dune Part Two"} rows={3} disabled={busy} value={pasted} onChange={(e) => setPasted(e.target.value)} style={{ width: "100%", marginTop: 8 }} />
        <div className="small muted" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <label htmlFor="plain">Unmarked lines are</label>
          <select id="plain" value={plain} disabled={busy} onChange={(e) => setPlain(e.target.value as Plain)}>
            <option value="watched">watched</option>
            <option value="watchlist">to watch</option>
          </select>
        </div>
        {readErr && <p className="small err" style={{ margin: "10px 0 0" }}>{readErr}</p>}
        {!entries && picked && !readErr && !busy && <p className="small err" style={{ margin: "10px 0 0" }}>Nothing found in that file.</p>}
        {entries && !busy && (
          <>
            <p className="small" style={{ margin: "10px 0" }}>{watched} watched ({rated} rated), {watchingN} watching, {listed} to watch.</p>
            <button className="btn gold" type="button" onClick={run}>Import</button>
          </>
        )}
        {busy && entries && <p className="small muted" style={{ margin: "10px 0 0" }}><span className="spin" />Importing {done} of {entries.length}. You can switch tabs; keep the app open.</p>}
        {tally && !busy && (
          <p className="small" style={{ margin: "10px 0 0" }}>Done: {tally.added} added, {tally.updated} updated{tally.unsure ? `, ${tally.unsure} not sure (to confirm)` : ""}{tally.unmatched ? `, ${tally.unmatched} not found on TMDB` : ""}{tally.failed ? `, ${tally.failed} could not be saved` : ""}.{tally.unmatched + tally.failed + tally.unsure > 0 ? " Check those in the review." : ""}</p>
        )}
        {importErr && <p className="small err" style={{ margin: "10px 0 0" }}>{importErr}</p>}
        {review.length > 0 && !busy && (
          <button className="btn" type="button" style={{ marginTop: 10 }} onClick={() => { close(); openReview(); }}>
            Review import{review.some((r) => unsaved(r) && !r.gone) ? ` (${review.filter((r) => unsaved(r) && !r.gone).length} to check)` : ""}
          </button>
        )}
        {reverted && <p className="small" style={{ margin: "10px 0 0" }}>{reverted}</p>}
      </div>}
      </SettingRow>
      <SettingRow label="Letterboxd sync" value={link ? link.user : "Off"}>
      <div aria-busy={pending}>
        {link ? (
          <>
            <p className="small muted" style={{ margin: "0 0 10px" }}>{link.syncedAt ? <>Checked <span suppressHydrationWarning>{new Date(link.syncedAt).toLocaleString()}</span></> : "Not checked yet"}</p>
            <div className="chips">
              <button className="btn" type="button" onClick={syncNow} disabled={pending}>{pending ? "Checking…" : "Sync now"}</button>
              <button className="btn" type="button" onClick={disconnect} disabled={pending}>Disconnect</button>
            </div>
            {link.error && <p className="small err" style={{ margin: "10px 0 0" }}>{link.error}</p>}
          </>
        ) : (
          <>
                        <div style={{ display: "flex", gap: 8 }}>
              <input id="lbu" aria-label="Letterboxd username" type="text" placeholder="Letterboxd username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && connect()} style={{ flex: 1 }} />
              <button className="btn gold" type="button" onClick={connect} disabled={pending || !name.trim()}>{pending ? "Connecting…" : "Connect"}</button>
            </div>
          </>
        )}
        {msg && <p className="small" style={{ margin: "10px 0 0" }}>{msg}</p>}
        {!link && err && <p className="small err" style={{ margin: "10px 0 0" }}>{err}</p>}
        {link && err && !link.error && <p className="small err" style={{ margin: "10px 0 0" }}>{err}</p>}
        {!link && <p className="small muted" style={{ margin: "8px 0 0" }}>Adds new diary entries as watched when you open the app. Needs a public profile.</p>}
      </div>
      </SettingRow>
    </>
  );
}
