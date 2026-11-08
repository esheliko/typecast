"use client";
import { useRef, useState } from "react";
import SettingRow from "@/components/SettingRow";
import { restoreChunk, restoreProfile } from "@/app/account-actions";
import { addCounts, chunks, parseBackup, type Backup, type Counts } from "@/lib/backup";

/** Account row: read a typecast-backup.json back in. Preview first; merging only adds missing titles and fills empty fields. */
export default function RestoreBackup() {
  return (
    <SettingRow label="Restore backup" title="Restore backup">
      <Panel />
    </SettingRow>
  );
}

const ZERO: Counts = { added: 0, filled: 0, same: 0 };

function Panel() {
  const [backup, setBackup] = useState<Backup | null>(null);
  const [name, setName] = useState("");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [withProfile, setWithProfile] = useState(false);
  const [busy, setBusy] = useState<"" | "reading" | "restoring">("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function run(b: Backup, apply: boolean): Promise<Counts | null> {
    let total = ZERO;
    for (const c of chunks(b.library)) {
      const r = await restoreChunk(c, apply);
      if (!r.ok) { setErr(r.error); return null; }
      total = addCounts(total, r);
    }
    return total;
  }
  async function pick(file: File | undefined) {
    setErr(""); setDone(""); setBackup(null); setCounts(null);
    if (!file) return;
    setName(file.name);
    if (file.size > 30 * 1024 * 1024) return setErr("That file is too big to be a Typecast backup.");
    setBusy("reading");
    try {
      const p = parseBackup(await file.text());
      if (!p.ok) return setErr(p.error);
      const c = await run(p.backup, false);
      if (c) { setBackup(p.backup); setCounts(c); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't read that file."); }
    finally { setBusy(""); }
  }
  async function restore() {
    if (!backup) return;
    setErr(""); setDone(""); setBusy("restoring");
    try {
      const c = await run(backup, true);
      if (!c) return;
      if (withProfile && backup.profile) { const r = await restoreProfile(backup.profile); if (!r.ok) return setErr(`Titles restored, but settings failed: ${r.error}`); }
      setDone(`Restored: ${c.added} added, ${c.filled} filled in, ${c.same} unchanged${withProfile && backup.profile ? ", settings restored" : ""}.`);
      setBackup(null); setCounts(null);
      if (input.current) input.current.value = "";
    } catch (e) { setErr(e instanceof Error ? e.message : "Restore failed."); }
    finally { setBusy(""); }
  }
  const nothing = counts && counts.added + counts.filled === 0;
  return (
    <div style={{ display: "grid", gap: 10 }} aria-busy={busy !== ""}>
      <p className="muted small" style={{ margin: 0 }}>Choose a <b>typecast-backup.json</b> from Export backup. Nothing is deleted: missing titles are added, and existing ones only get an empty rating, note or progress filled in.</p>
      <input ref={input} type="file" accept="application/json,.json" aria-label="Backup file" disabled={busy !== ""} onChange={(e) => void pick(e.target.files?.[0])} />
      {busy === "reading" && <p className="muted small" style={{ margin: 0 }}>Checking {name}…</p>}
      {counts && backup && (
        <div role="status">
          <b className="small">{backup.library.length} titles in {name}</b>
          <ul className="small" style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            <li>{counts.added} new, will be added</li>
            <li>{counts.filled} would change (empty rating, note or progress filled in)</li>
            <li>{counts.same} unchanged</li>
          </ul>
        </div>
      )}
      {backup?.profile && (
        <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={withProfile} onChange={(e) => setWithProfile(e.target.checked)} /> Also restore country, services and details order (replaces your current settings)
        </label>
      )}
      {backup && <button className="btn gold" type="button" disabled={busy !== "" || (!!nothing && !withProfile)} onClick={() => void restore()} style={{ justifyContent: "center" }}>{busy === "restoring" ? "Restoring…" : nothing && !withProfile ? "Nothing to restore" : "Restore"}</button>}
      {err && <p className="err small" role="alert" style={{ margin: 0 }}>{err}</p>}
      {done && <p className="small" role="status" style={{ margin: 0 }}>{done}</p>}
    </div>
  );
}
