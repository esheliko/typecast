"use client";
import { useEffect, useState, type ReactNode } from "react";

const MS = 450; // keep in step with .collapse in globals.css

/**
 * Animated expand / collapse: the body slides open (grid rows 0fr -> 1fr) so what sits below glides down instead of jumping.
 * Starts already open when `open` is true on first render (no animation on page load); unmounts the body once closed.
 */
export default function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  const [settled, setSettled] = useState(open); // after opening, stop clipping so the poster strip can bleed to the edges
  useEffect(() => {
    let a = 0, b = 0, t = 0;
    if (open) {
      setMounted(true);
      a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setShown(true)); });
      t = window.setTimeout(() => setSettled(true), MS + 60);
    } else {
      setShown(false);
      setSettled(false);
      t = window.setTimeout(() => setMounted(false), MS + 40);
    }
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); clearTimeout(t); };
  }, [open]);
  if (!mounted) return null;
  return (
    <div className={`collapse${shown ? " on" : ""}${settled ? " settled" : ""}`} aria-hidden={!open || undefined}>
      <div className="collapse-in">{children}</div>
    </div>
  );
}
