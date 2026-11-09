"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { badgeEntry, badgeSnapshot, subscribeBadges } from "@/lib/upcoming-badges";
import { localDay, rowBadge } from "@/lib/upcoming";

/** "Out Fri" / "S5 in 12 days" under a Library row's title, when the title has an upcoming date. Renders nothing otherwise. */
export default function RowBadge({ k }: { k: string }) {
  useSyncExternalStore(subscribeBadges, badgeSnapshot, badgeSnapshot);
  const e = badgeEntry(k);
  const [today, setToday] = useState("");
  useEffect(() => setToday(localDay()), []);
  const b = e && today ? rowBadge(e, today) : null;
  return b ? <span className={`pill when${b.soon ? " soon" : ""}`} data-testid="when-badge">{b.text}</span> : null;
}
