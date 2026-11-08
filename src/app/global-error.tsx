"use client";
import { useEffect } from "react";

/** Last resort when even the root layout fails. Self-contained: no app CSS or fonts can be assumed. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); const t = setTimeout(() => location.reload(), 5000); return () => clearTimeout(t); }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, boxSizing: "border-box", fontFamily: "system-ui,-apple-system,sans-serif", textAlign: "center", background: "#eef0f4", color: "#14161c" }}>
        <main>
          <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 12 }}>Typecast</div>
          <p style={{ color: "#5d6472", margin: "0 0 18px" }}>Back in a moment. Your library is safe. Retrying automatically…</p>
          <button type="button" onClick={() => reset()} style={{ font: "600 14px system-ui,sans-serif", padding: "9px 18px", border: 0, borderRadius: 999, background: "#e3e6ed", cursor: "pointer" }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
