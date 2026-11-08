"use client";
import type { Status } from "@/lib/types";

const PATHS = {
  watched: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  must: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z" />,
  watchlist: <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />,
  watching: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" fill="currentColor" /></>,
  partial: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><path d="M12 5.5v13" /><circle cx="9.5" cy="12" r="2" fill="currentColor" /></>,
};

/** The one set of status icons (eye, half eye, bookmark, star, check) shared by the quick marks and the title popup. */
export default function StatusIcon({ kind, size }: { kind: Status | "must"; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{PATHS[kind]}</svg>;
}
