"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { setPanel } from "@/lib/panel-motion";

/**
 * A Library panel body that slides open and closed. It is always rendered (so opening costs no mount) and `src/lib/panel-motion.ts`
 * drives it imperatively: the layout changes once, the motion is only painted. React never touches `hidden` after the first render.
 */
export default function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [first] = useState(open); // the server-rendered state: closed panels start hidden, open ones start open
  const was = useRef(open);
  useLayoutEffect(() => {
    if (was.current === open || !ref.current) return;
    was.current = open;
    setPanel(ref.current, open);
  }, [open]);
  return <div ref={ref} className="collapse" hidden={!first}><div className="collapse-in">{children}</div></div>;
}
