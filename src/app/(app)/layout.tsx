import { Suspense } from "react";
import { BgTracker } from "@/components/Modal";
import Tabs from "@/components/Tabs";
import { GlimpseProvider } from "@/components/Glimpse";
import Recheck from "@/components/Recheck";
import ScrollKeeper from "@/components/ScrollKeeper";
import HeaderHeight from "@/components/HeaderHeight";
import { ImportProvider } from "@/components/ImportState";
import { LibProvider } from "@/components/cast/LibState";
import { getLibrary } from "@/lib/library";
import { packMark } from "@/lib/marks";

export default async function AppLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  // Marks are decoration: if the database blips, the shell and the page's own error handling should still work.
  const lib = await getLibrary().catch(() => []);
  // GlimpseProvider wraps LibProvider: the franchise sheet (rendered by LibProvider) has glimpse buttons too.
  // One set of marks for every page and for the title popup, so a title marked anywhere is marked everywhere at once.
  const marks = Object.fromEntries(lib.map((l) => [l.key, packMark({ status: l.status, priority: l.priority, rich: l.rating > 0 || !!l.note.trim() })]));
  return (
    <GlimpseProvider>
      <LibProvider packed={marks}>
      <ImportProvider>
      <Suspense fallback={null}><BgTracker /></Suspense>
      <ScrollKeeper />
      <Suspense fallback={null}><Recheck /></Suspense>
      <header className="top"><div className="top-in">
        <div className="logo"><span className="mark" aria-hidden="true" />Typecast</div>
        <Tabs where="top" />
      </div></header>
      <HeaderHeight />
      <main className="wrap">{children}</main>
      <Tabs where="bottom" />
      {modal}
      </ImportProvider>
      </LibProvider>
    </GlimpseProvider>
  );
}
