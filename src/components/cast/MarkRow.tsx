"use client";
import QuickMark from "./QuickMark";
import RelatedButton from "./RelatedButton";
import { TitleLink } from "../Modal";
import { Thumb } from "../ui";
import { GlimpseButton } from "../Glimpse";
import { creditSpec, titleSpec } from "@/lib/glimpse";
import { avgLabel, typeLabel } from "@/lib/img";
import type { Item } from "@/lib/types";

/** A title in a list: tap the name for its details, or tap Watched / To watch / Must watch right there without leaving the list. */
/** `extra` is appended to the line under the title but, unlike `sub`, is not part of the image search. */
export default function MarkRow({ it, sub, small, actor, extra }: { it: Item; sub?: string; small?: boolean; actor?: string; extra?: string }) {
  return (
    <div className="row mark-row">
      <TitleLink k={it.key} it={it} className="row-link">
        <Thumb path={it.poster} />
        <span className="row-main">
          <span className="row-title" style={small ? { fontSize: 17 } : undefined}>{it.title}</span>
          <span className="row-sub">{it.year} · {typeLabel(it.type)}{avgLabel(it)}{sub ? ` · ${sub}` : ""}{extra ? ` · ${extra}` : ""}</span>
        </span>
      </TitleLink>
      <QuickMark it={it} variant="inline" />
      <GlimpseButton spec={actor ? creditSpec(actor, sub, it) : titleSpec(it)} label={actor && sub ? `See images of ${it.title}, or ${actor} as ${sub}` : undefined} />
      <RelatedButton it={it} />
    </div>
  );
}
