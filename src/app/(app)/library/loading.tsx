import Link from "next/link";
import { ChipsSkeleton, RowsSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return <div className="page" aria-busy="true"><div className="page-head"><h1>Library</h1><Link href="/library/stats">Stats <span aria-hidden="true">›</span></Link></div><ChipsSkeleton n={5} w={78} /><div style={{ marginTop: 14 }}><RowsSkeleton n={8} /></div></div>;
}
