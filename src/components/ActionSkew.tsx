"use client";
import { useEffect } from "react";

const KEY = "tc-skew-reload";

/**
 * After a deploy, a tab that was open before it still holds the OLD server-action ids; the new build answers them with a 404
 * (header `x-nextjs-action-not-found`), so every write fails until the page is refreshed. Watch for that one answer and
 * reload once (guarded, so a real 404 can never loop); the next action then uses the new ids.
 */
export default function ActionSkew() {
  useEffect(() => {
    const orig = window.fetch;
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const res = await orig.apply(this, args);
      try {
        const h = new Headers(args[1]?.headers ?? (args[0] instanceof Request ? args[0].headers : undefined));
        if (h.has("Next-Action") && res.status === 404 && res.headers.has("x-nextjs-action-not-found")) {
          const last = Number(sessionStorage.getItem(KEY) ?? 0);
          if (Date.now() - last > 30_000) { sessionStorage.setItem(KEY, String(Date.now())); location.reload(); }
        }
      } catch { /* storage or headers unavailable: leave the failure as is */ }
      return res;
    };
    return () => { window.fetch = orig; };
  }, []);
  return null;
}
