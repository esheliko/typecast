import { ChipsSkeleton, GridSkeleton } from "@/components/Skeletons";

/** Shown while a tab loads on the first visit; the Browse tab is by far the most common one, so it's shaped like Browse. */
export default function Loading() {
  return <div className="page" aria-busy="true"><ChipsSkeleton n={6} w={92} /><GridSkeleton /></div>;
}
