"use client";
import { useEffect, useRef } from "react";

/** Friendly failure screen shared by the error boundaries: retries on its own (a deploy or a blip usually clears in seconds), with a manual button. */
export default function ErrorView({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const tries = useRef(0);
  useEffect(() => { console.error(error); }, [error]);
  useEffect(() => {
    if (tries.current >= 3) return;
    const t = setTimeout(() => {
      tries.current += 1;
      // The first retries re-render in place; the last one reloads, which also picks up a freshly deployed build.
      if (tries.current < 3) reset(); else location.reload();
    }, 3000 * (tries.current + 1));
    return () => clearTimeout(t);
  }, [error, reset]);
  return (
    <div className="login" role="alert">
      <div className="logo"><span className="mark" aria-hidden="true" />Typecast</div>
      <p className="muted">Something went wrong on our side. Your library is safe. Retrying…</p>
      {error.digest && <p className="muted" style={{ fontSize: 12, margin: "0 0 12px" }}>Reference <span className="mono">{error.digest}</span> (quote it when reporting this)</p>}
      <button type="button" className="btn gold" onClick={() => { tries.current = 0; reset(); }}>Try again</button>
      <button type="button" className="btn" style={{ marginLeft: 8 }} onClick={() => location.reload()}>Reload</button>
    </div>
  );
}
