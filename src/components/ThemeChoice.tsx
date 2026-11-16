"use client";
import { useState } from "react";
import SettingRow from "@/components/SettingRow";
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
  return (
    <SettingRow label="Theme" title="Theme">
      <Picker />
    </SettingRow>
  );
}

function Picker() {
  const [t, setT] = useState<Theme>(saved);
  return (
    <div className="seg" role="group" aria-label="Theme">
      {THEMES.map(([k, text]) => <button key={k} type="button" aria-pressed={t === k} onClick={() => { setT(k); apply(k); }}>{text}</button>)}
    </div>
  );
}
