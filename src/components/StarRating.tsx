"use client";
import { useState } from "react";

/**
 * Five rating stars. Hovering (mouse only) previews the rating: every star up to the one under the pointer lights up,
 * so what you will get is what you see. The hit areas touch each other edge to edge (no dead gaps, no overlap) and the
 * preview ends when the pointer leaves the whole row. Tapping the lit star clears it (the caller decides what a tap does).
 */
export default function StarRating({ value, onRate, className = "", label, style }: {
  value: number; onRate: (n: number) => void; className?: string; label: string; style?: React.CSSProperties;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  return (
    <div className={`stars star-rating ${className}`} role="group" aria-label={label} style={style}
      onPointerLeave={() => setHover(null)} onPointerCancel={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" data-on={n <= shown ? "1" : undefined} data-preview={hover !== null && hover !== value ? "1" : undefined}
          onClick={() => { setHover(null); onRate(n); }}
          onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(n); }}
          aria-pressed={n === value} aria-label={n === 1 ? "1 star" : `${n} stars`}>{n <= shown ? "★" : "☆"}</button>
      ))}
    </div>
  );
}
