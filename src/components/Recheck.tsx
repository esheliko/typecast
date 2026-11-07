import { recheckEpisodes } from "@/lib/library";
import RefreshNow from "./RefreshNow";

/** Checks watched series for new episodes after the page is already on screen, and refreshes it only if something moved. */
export default async function Recheck() {
  const moved = await recheckEpisodes().catch(() => false);
  return moved ? <RefreshNow /> : null;
}
