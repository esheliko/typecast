"use client";
import { useState, useTransition } from "react";
import SettingRow from "@/components/SettingRow";
import { changePassword } from "@/app/account-actions";

/** Account row: change your own password. The server re-checks the current one first. */
export default function ChangePassword() {
  return (
    <SettingRow label="Change password" title="Change password">
      <Form />
    </SettingRow>
  );
}

function Form() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setOk(false);
    if (next.length < 8) return setErr("The new password must be at least 8 characters.");
    if (next !== again) return setErr("The two new passwords don't match.");
    start(async () => {
      const r = await changePassword(cur, next, again);
      if (r.ok) { setOk(true); setCur(""); setNext(""); setAgain(""); } else setErr(r.error);
    });
  };
  return (
    <form onSubmit={submit} aria-busy={pending} style={{ display: "grid", gap: 8 }}>
      <input type="password" aria-label="Current password" autoComplete="current-password" placeholder="Current password" required value={cur} onChange={(e) => setCur(e.target.value)} />
      <input type="password" aria-label="New password" autoComplete="new-password" placeholder="New password (8+ characters)" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
      <input type="password" aria-label="Repeat new password" autoComplete="new-password" placeholder="Repeat new password" required value={again} onChange={(e) => setAgain(e.target.value)} />
      <button className="btn gold" type="submit" disabled={pending} style={{ justifyContent: "center" }}>{pending ? "Checking…" : "Change password"}</button>
      {err && <p className="err small" role="alert" style={{ margin: 0 }}>{err}</p>}
      {ok && <p className="small" role="status" style={{ margin: 0 }}>Password changed. Use the new one next time you sign in.</p>}
    </form>
  );
}
