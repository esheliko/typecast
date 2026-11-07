"use client";
import { useEffect } from "react";

// Notices when a newer deployment goes live and swaps the open page over to it at a quiet moment, so there is no
// manual refresh. A running page can't hot-swap its JavaScript, so this reloads, but only when you are not
// mid-interaction (or when the tab is in the background), and puts the scroll position back afterwards.

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID;
const POLL_MS = 60_000; // how often to ask which deployment is live (also on focus / tab shown / back online)
const IDLE_MS = 10_000; // how long you must have been still before a visible page is swapped
const SCROLL_KEY = "tc:scroll"; // scroll position carried across the reload
const DONE_KEY = "tc:updated-to"; // last build we reloaded for, so a mismatch can never cause a reload loop

const NON_TEXT = ["button", "submit", "reset", "checkbox", "radio", "range", "file", "image", "color"];
function typing() {
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement) return el.value.length > 0;
  if (el instanceof HTMLInputElement) return !NON_TEXT.includes(el.type) && el.value.length > 0;
  return el instanceof HTMLElement && el.isContentEditable;
}

function restoreScroll(y: number) {
  const t0 = Date.now();
  const step = () => {
    const room = document.documentElement.scrollHeight - window.innerHeight;
    if (room >= y || Date.now() - t0 > 2000) { window.scrollTo({ top: Math.min(y, Math.max(room, 0)), behavior: "instant" as ScrollBehavior }); return; }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export default function UpdateWatcher() {
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SCROLL_KEY);
      if (raw) {
        sessionStorage.removeItem(SCROLL_KEY);
        const s = JSON.parse(raw) as { url: string; y: number; t: number };
        if (s.url === location.pathname + location.search && s.y > 0 && Date.now() - s.t < 30_000) restoreScroll(s.y);
      }
    } catch {}

    if (!BUILD || process.env.NODE_ENV !== "production") return;
    let latest: string | null = null; // set once a different deployment is seen
    let last = Date.now(); // last time you touched the page
    const touch = () => { last = Date.now(); };

    function apply() {
      if (!latest || typing()) return;
      if (document.visibilityState === "visible" && Date.now() - last < IDLE_MS) return;
      try {
        sessionStorage.setItem(DONE_KEY, latest);
        sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ url: location.pathname + location.search, y: window.scrollY, t: Date.now() }));
      } catch {}
      location.reload();
    }
    async function check() {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const { id } = (await r.json()) as { id?: string };
        let done = null; try { done = sessionStorage.getItem(DONE_KEY); } catch {}
        if (id && id !== BUILD && id !== done) latest = id;
      } catch {}
      apply();
    }
    const onVis = () => { if (document.visibilityState === "visible") check(); else apply(); };

    const events = ["pointerdown", "keydown", "touchstart", "wheel", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    const poll = setInterval(check, POLL_MS);
    const tick = setInterval(apply, 3000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch, { capture: true }));
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      clearInterval(poll); clearInterval(tick);
    };
  }, []);
  return null;
}
