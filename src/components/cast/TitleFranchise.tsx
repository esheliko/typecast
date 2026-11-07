"use client";
import { useState } from "react";
import { FranchiseList, type Group } from "./Franchise";
import { useLib } from "./LibState";

/**
 * "Same franchise" block on a title page. Folded away by default to keep the page short; tap to open.
 */
export default function TitleFranchise({ groups, titleKey }: { groups: Group[]; titleKey: string }) {
  const { get } = useLib();
  void titleKey;
  const [open, setOpen] = useState(false);
  const keys = [...new Set(groups.flatMap((g) => g.items.map((i) => i.key)))];
  const left = keys.filter((k) => !get(k)).length;
  const names = groups.map((g) => g.label).join(" · ");
  return (
    <>
      <h2>Same franchise</h2>
      <button type="button" className="card pad fr-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="fr-sum"><strong>{names}</strong><span className="small muted">{keys.length} titles · {keys.length - left} marked{left ? `, ${left} to go` : ""}</span></span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && <FranchiseList groups={groups} />}
    </>
  );
}
