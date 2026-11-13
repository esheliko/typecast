"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { GlimpseButton, useGlimpse } from "./Glimpse";
import { SpoilerGate } from "./SpoilerGate";
import type { GlimpseSpec } from "@/lib/glimpse";
import type { HiddenLine } from "@/lib/spoiler-line";

/**
 * Cast rows of a series that is Watching: "Tap a face: character note, up to your place" with the compact spoiler gate.
 * Show lifts the line for this view only (it only flips state here; nothing is written). Without `hidden` it renders just the children.
 * See docs/features/glimpse.md and docs/features/spoilers.md.
 */
const Lifted = createContext(false);

export function CastFaceScope({ title, titleKey, hidden, children }: { title: string; titleKey: string; hidden?: HiddenLine; children: ReactNode }) {
  const [lifted, setLifted] = useState(false);
  return (
    <Lifted.Provider value={lifted}>
      {hidden && (
        <p className="small muted cast-face-note">
          Tap a face: character note, up to your place{" "}
          {lifted ? <span>· Later episodes shown</span> : <SpoilerGate compact title={title} hidden={hidden} what="later episodes" onShow={() => setLifted(true)} placeHref={`/watching?k=${titleKey.replace(":", "-")}`} />}
        </p>
      )}
      {children}
    </Lifted.Provider>
  );
}

const lift = (spec: GlimpseSpec, on: boolean): GlimpseSpec => (on && spec.info ? { ...spec, info: { ...spec.info, reveal: true } } : spec);

/** The small About button and the face on top of the avatar: both open the same About sheet for that person as that character. */
export function CastAbout({ spec, label }: { spec: GlimpseSpec; label?: string }) {
  const lifted = useContext(Lifted);
  const open = useGlimpse();
  const s = lift(spec, lifted);
  const text = label ?? `About ${spec.heading}`;
  return (
    <>
      <span className="credit-gl"><GlimpseButton spec={s} label={label} /></span>
      {spec.info && <button type="button" className="credit-face" tabIndex={-1} aria-label={text} title={text} onClick={() => open(s)} />}
    </>
  );
}
