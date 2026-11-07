"use client";
import { useEffect, useState } from "react";
import { FranchiseList, type Group } from "./Franchise";
import { useLib } from "./LibState";

/**
 * "Same franchise" block on a title page. It opens by itself once you have marked this title as seen,
 * which is the moment you want to go through the others, and stays folded away until then.
 */
export default function TitleFranchise({ groups, titleKey }: { groups: Group[]; titleKey: string }) {
  const { get } = useLib();
  const s = get(titleKey)?.status;
  const seenThis = !!s && s !== "watchlist";
  const [open, setOpen] = useState(seenThis);
  useEffect(() => { if (seenThis) setOpen(true); }, [seenThis]);
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
