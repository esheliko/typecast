import { Suspense } from "react";
import { BgTracker } from "@/components/Modal";
import Tabs from "@/components/Tabs";
import { GlimpseProvider } from "@/components/Glimpse";
import Recheck from "@/components/Recheck";
import { LibProvider } from "@/components/cast/LibState";
import { getLibrary } from "@/lib/library";
import type { Mark } from "@/lib/types";

export default async function AppLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  const lib = await getLibrary();
  // One set of marks for every page and for the title popup, so a title marked anywhere is marked everywhere at once.
  const marks: Record<string, Mark> = Object.fromEntries(lib.map((l) => [l.key, { status: l.status, priority: l.priority, rich: l.rating > 0 || !!l.note.trim() }]));
  return (
    <LibProvider initial={marks}>
      <GlimpseProvider>
      <Suspense fallback={null}><BgTracker /></Suspense>
      <Suspense fallback={null}><Recheck /></Suspense>
      <header className="top"><div className="top-in">
        <div className="logo"><span className="mark" aria-hidden="true" />Typecast</div>
        <Tabs where="top" />
      </div></header>
      <main className="wrap">{children}</main>
      <Tabs where="bottom" />
      {modal}
      </GlimpseProvider>
    </LibProvider>
  );
}
