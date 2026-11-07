"use client";
import { useState, useTransition } from "react";
import { sendCode, verifyCode } from "./actions";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function send(e: React.FormEvent) {
    e.preventDefault(); setError("");
    start(async () => { const r = await sendCode(email); if (r.error) setError(r.error); else setStep("code"); });
  }
  function verify(e: React.FormEvent) {
    e.preventDefault(); setError("");
    start(async () => { const r = await verifyCode(email, code); if (r?.error) setError(r.error); });
  }
  return step === "email" ? (
    <form onSubmit={send}>
      <p className="muted" style={{ margin: 0 }}>Sign in with your email. We send a code, no password needed.</p>
      <label className="l" htmlFor="email" style={{ margin: 0 }}>Email</label>
      <input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      <button className="btn gold" type="submit" disabled={pending} style={{ justifyContent: "center" }}>{pending ? "Sending…" : "Send code"}</button>
      {error && <p className="err" role="alert" style={{ margin: 0 }}>{error}</p>}
    </form>
  ) : (
    <form onSubmit={verify}>
      <p className="muted" style={{ margin: 0 }}>We sent a code to <b>{email}</b>. Enter it below.</p>
      <label className="l" htmlFor="code" style={{ margin: 0 }}>Code</label>
      <input id="code" className="code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))} maxLength={10} />
      <button className="btn gold" type="submit" disabled={pending} style={{ justifyContent: "center" }}>{pending ? "Checking…" : "Sign in"}</button>
      {error && <p className="err" role="alert" style={{ margin: 0 }}>{error}</p>}
      <button type="button" className="small muted" onClick={() => { setStep("email"); setCode(""); setError(""); }}>Use a different email</button>
    </form>
  );
}
