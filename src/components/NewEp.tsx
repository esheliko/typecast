"use client";
import { useLib } from "./cast/LibState";
import { newEpLabel } from "@/lib/new-episode";

/**
 * The small "New episode" / "New season" marker for a series that came back from Watched. It follows the live mark, so it
 * goes the moment the series is marked Watched again. `detail` ("S3 E1 aired 12 Nov") is added where there is room.
 */
export default function NewEpPill({ k, detail }: { k: string; detail?: string }) {
  const fresh = useLib().get(k)?.fresh;
  if (!fresh) return null;
  return <span className="pill newep" data-testid="new-ep">{newEpLabel({ season: fresh === "season" })}{detail && <span className="newep-d"> · {detail}</span>}</span>;
}
