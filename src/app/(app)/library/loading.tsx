import { ChipsSkeleton, RowsSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return <div className="page" aria-busy="true"><ChipsSkeleton n={5} w={78} /><div style={{ marginTop: 14 }}><RowsSkeleton n={8} /></div></div>;
}
