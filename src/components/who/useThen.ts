"use client";
import { useCallback, useSyncExternalStore } from "react";

/** The Now | Then photos switch, shared by the Finder and the details pane (remembered on this device). */
export const THEN_KEY = "typecast.who.then";
const EVT = "typecast:then";

const read = () => { try { return localStorage.getItem(THEN_KEY) === "1"; } catch { return false; } };
const sub = (cb: () => void) => { window.addEventListener(EVT, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(EVT, cb); window.removeEventListener("storage", cb); }; };

export function useThen(): [boolean, (v: boolean) => void] {
  const on = useSyncExternalStore(sub, read, () => false);
  const set = useCallback((v: boolean) => { try { localStorage.setItem(THEN_KEY, v ? "1" : "0"); } catch { /* private mode */ } window.dispatchEvent(new Event(EVT)); }, []);
  return [on, set];
}
