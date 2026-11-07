"use client";
import { useState, useTransition } from "react";
import { signIn } from "./actions";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    start(async () => { const r = await signIn(email, password); if (r?.error) setError(r.error); });
  }
  return (
    <form onSubmit={submit}>
      <p className="muted" style={{ margin: 0 }}>Sign in to your Typecast library.</p>
      <label className="l" htmlFor="email" style={{ margin: 0 }}>Email</label>
      <input id="email" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      <label className="l" htmlFor="password" style={{ margin: 0 }}>Password</label>
      <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="btn gold" type="submit" disabled={pending} style={{ justifyContent: "center" }}>{pending ? "Signing in…" : "Sign in"}</button>
      {error && <p className="err" role="alert" style={{ margin: 0 }}>{error}</p>}
    </form>
  );
}
