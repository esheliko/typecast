import { isKind, type Kind } from "./kind";

/**
 * Small display choices (is Watch next open, which Films/Series tab...) kept in ONE cookie instead of localStorage, so the server
 * renders the page already in the saved state. Reading localStorage after mount made sections paint open and then snap shut
 * (or the reverse) on every visit. Defaults here are what a first-time visitor sees.
 */
export const UI_COOKIE = "tc_ui";
export type UpSrc = "both" | "new" | "library";
export interface UiPrefs {
  /** Watch next collapsed to one slim row. */
  unClosed: boolean; unMine: boolean; unSrc: UpSrc; unKind: Kind;
  /** Upcoming expanded. */
  upOpen: boolean;
}
export const UI_DEFAULTS: UiPrefs = { unClosed: false, unMine: false, unSrc: "both", unKind: "all", upOpen: false };

export function parseUi(raw: string | undefined | null): UiPrefs {
  const out = { ...UI_DEFAULTS };
  if (!raw) return out;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    if (typeof v.unClosed === "boolean") out.unClosed = v.unClosed;
    if (typeof v.unMine === "boolean") out.unMine = v.unMine;
    if (v.unSrc === "new" || v.unSrc === "library" || v.unSrc === "both") out.unSrc = v.unSrc;
    if (isKind(v.unKind)) out.unKind = v.unKind;
    if (typeof v.upOpen === "boolean") out.upOpen = v.upOpen;
  } catch { /* bad cookie: defaults */ }
  return out;
}

/** Client only: merge a change into the cookie (a year, this device). */
export function saveUi(patch: Partial<UiPrefs>) {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${UI_COOKIE}=([^;]*)`));
    const next = { ...parseUi(m?.[1]), ...patch };
    document.cookie = `${UI_COOKIE}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=31536000; samesite=lax`;
  } catch { /* cookies blocked: the choice just won't stick */ }
}
