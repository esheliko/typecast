"use client";
import { useEffect, useState } from "react";
import { THEMES, THEME_KEY, type Theme } from "@/lib/theme";

function saved(): Theme {
  try { const t = localStorage.getItem(THEME_KEY); return t === "light" || t === "dark" ? t : "system"; } catch { return "system"; }
}

function apply(t: Theme) {
  if (t === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  try { if (t === "system") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch {}
}

/** Appearance row: System (follows the device), Light or Dark. Stored on this device only. */
export default function ThemeChoice() {
  const [t, setT] = useState<Theme>("system");
  // Read the saved choice after mount so server and client render the same markup.
  useEffect(() => { setT(saved()); }, []);
  return (
    <div className="srow stack">
      <span id="theme-l">Theme</span>
      <div className="seg" role="group" aria-labelledby="theme-l">
        {THEMES.map(([k, text]) => <button key={k} type="button" aria-pressed={t === k} onClick={() => { setT(k); apply(k); }}>{text}</button>)}
      </div>
    </div>
  );
}
