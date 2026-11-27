"use client";
import { useEffect } from "react";
import { useLib } from "./cast/LibState";
import { usePageLine } from "./PageLine";
import { lineCacheKey, markLine, pageFor } from "@/lib/spoiler-line";
import { loadFaces, loadImdbEps, loadSeason, startSeason } from "@/lib/season-load";

/**
 * A hard load of a series page is replayed as a popup over the page underneath, and the episode list only mounts once that has landed. This asks for the
 * opening season (list, faces, IMDb scores) from the first render, with exactly the questions the list will ask, so the answers are already on their way
 * (or here) when it appears. The loaders keep each answer once; nothing is shown from here and a failure is the list's own business.
 */
export default function EpisodesWarm({ id, seasons, progress }: { id: number; seasons: { n: number; eps: number }[]; progress: { s: number; e: number } | null }) {
  const lib = useLib();
  const pageCtx = usePageLine();
  const tvKey = `tv:${id}`;
  const page = pageFor(pageCtx, tvKey);
  const line = markLine(tvKey, lib.get(tvKey), { page });
  const lk = lineCacheKey({ page, line });
  useEffect(() => {
    const s = startSeason(seasons, progress);
    loadSeason(id, s, line, page, false).catch(() => {});
    loadFaces(id, s, lk, page, false).catch(() => {});
    void loadImdbEps(id, s);
    // Once per page view: the question is the one the list asks first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return null;
}
