"use client";
import { useState, useTransition } from "react";
import SettingRow from "@/components/SettingRow";
import { addUser, editUser, removeUser, type ManagedUser } from "@/app/users-actions";

/** Admin only: add, edit (email / new password) and remove accounts. */
export default function ManageUsers({ users }: { users: ManagedUser[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nEmail, setNEmail] = useState("");
  const [nPass, setNPass] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) {
    setErr(""); setMsg("");
    start(async () => { const r = await fn(); if (r.ok) { after?.(); setMsg("Saved."); } else setErr(r.error); });
  }
  return (
    <SettingRow label="Manage users" value={users.length}>
      <div aria-busy={pending}>
        {users.map((u) => (
          <div key={u.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{u.email}{u.isAdmin && <span className="muted small"> · you (admin)</span>}</span>
              <button className="btn sm" type="button" onClick={() => { setEditing(editing === u.id ? null : u.id); setNEmail(u.email); setNPass(""); setErr(""); setMsg(""); }}>{editing === u.id ? "Cancel" : "Edit"}</button>
              {!u.isAdmin && <button className="btn sm" type="button" disabled={pending} onClick={() => { if (confirm(`Remove ${u.email} and all of their library data?`)) run(() => removeUser(u.id)); }}>Remove</button>}
            </div>
            <div className="muted small">Last sign-in: {u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString() : "never"}</div>
            {editing === u.id && (
              <form style={{ display: "grid", gap: 8, marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); run(() => editUser(u.id, nEmail === u.email ? "" : nEmail, nPass), () => setEditing(null)); }}>
                <input type="email" aria-label="Email" value={nEmail} onChange={(e) => setNEmail(e.target.value)} />
                <input type="password" aria-label="New password" autoComplete="new-password" placeholder="New password (leave blank to keep)" value={nPass} onChange={(e) => setNPass(e.target.value)} />
                <button className="btn gold" type="submit" disabled={pending} style={{ justifyContent: "center" }}>Save changes</button>
              </form>
            )}
          </div>
        ))}
        <form style={{ display: "grid", gap: 8, marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); run(() => addUser(email, password), () => { setEmail(""); setPassword(""); }); }}>
          <b className="small">Add a user</b>
          <input type="email" aria-label="New user email" autoComplete="off" placeholder="email@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" aria-label="New user password" autoComplete="new-password" placeholder="Password (8+ characters)" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn gold" type="submit" disabled={pending} style={{ justifyContent: "center" }}>Add user</button>
        </form>
        {err && <p className="err small" role="alert" style={{ margin: "8px 0 0" }}>{err}</p>}
        {msg && !err && <p className="muted small" style={{ margin: "8px 0 0" }}>{msg}</p>}
      </div>
    </SettingRow>
  );
}
