"use client";
import { useRef } from "react";
import type { PointerEvent } from "react";

/** Drag an element downwards to dismiss it (touch and mouse). Moves it with the finger, springs back when released early. */
export function useSwipeDismiss(onDismiss: () => void) {
  const start = useRef<{ y: number; drag: boolean } | null>(null);
  const move = (el: HTMLElement, dy: number, anim: boolean) => {
    el.style.transition = anim ? "transform .15s, opacity .15s" : "none";
    el.style.transform = dy ? `translateY(${dy}px)` : "";
    el.style.opacity = dy ? String(Math.max(0.2, 1 - dy / 120)) : "";
  };
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => { start.current = { y: e.clientY, drag: false }; },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = start.current; if (!s) return;
      const dy = Math.max(0, e.clientY - s.y);
      if (!s.drag && dy > 6) { s.drag = true; e.currentTarget.setPointerCapture(e.pointerId); }
      if (s.drag) move(e.currentTarget, dy, false);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const s = start.current; start.current = null;
      if (!s?.drag) return;
      const dy = e.clientY - s.y;
      if (dy > 40) onDismiss(); else move(e.currentTarget, 0, true);
    },
    onPointerCancel: (e: PointerEvent<HTMLElement>) => { if (start.current?.drag) move(e.currentTarget, 0, true); start.current = null; },
  };
}
