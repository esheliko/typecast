"use client";
import QuickMark from "./QuickMark";
import RelatedButton from "./RelatedButton";
import { TitleLink } from "../Modal";
import { Thumb } from "../ui";
import { typeLabel } from "@/lib/img";
import type { Item } from "@/lib/types";

/** A title in a list: tap the name for its details, or tap Watched / To watch / Must watch right there without leaving the list. */
export default function MarkRow({ it, sub, small }: { it: Item; sub?: string; small?: boolean }) {
  return (
    <div className="row">
      <TitleLink k={it.key} className="row-link">
        <Thumb path={it.poster} />
        <span className="row-main">
          <span className="row-title" style={small ? { fontSize: 17 } : undefined}>{it.title}</span>
          <span className="row-sub">{it.year} · {typeLabel(it.type)}{sub ? ` · ${sub}` : ""}</span>
        </span>
      </TitleLink>
      <QuickMark it={it} variant="inline" />
      <RelatedButton it={it} />
    </div>
  );
}
