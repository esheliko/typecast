"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const KEY = "typecast.rechecked";
const EVERY = 30 * 60 * 1000;

/** Checks watched series for new episodes (and runs the Letterboxd sync) once per browser session, not on every refresh of the layout. Refreshes only if something moved. */
export default function RecheckOnce() {
  const router = useRouter();
  useEffect(() => {
    try { if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < EVERY) return; sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage unavailable: check on every load */ }
    fetch("/api/recheck", { method: "POST" }).then((r) => r.json()).then((j) => { if (j?.moved) router.refresh(); }).catch(() => {});
  }, [router]);
  return null;
}
