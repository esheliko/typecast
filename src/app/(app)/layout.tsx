import { Suspense } from "react";
import { cookies } from "next/headers";
import { BgTracker, PendingPopup } from "@/components/Modal";
import Tabs from "@/components/Tabs";
import { GlimpseProvider } from "@/components/Glimpse";
import RecheckOnce from "@/components/RecheckOnce";
import ScrollKeeper from "@/components/ScrollKeeper";
import HeaderHeight from "@/components/HeaderHeight";
import { ImportProvider } from "@/components/ImportState";
import { LibProvider } from "@/components/cast/LibState";
import { getLibrary } from "@/lib/library";
import { packMark } from "@/lib/marks";
import { WatchProvider } from "@/components/Watching";
import { parseWatch, WATCH_COOKIE } from "@/lib/watching";

export default async function AppLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  // Marks are decoration: if the database blips, the shell and the page's own error handling should still work.
  const [lib, jar] = await Promise.all([getLibrary().catch(() => []), cookies()]);
  const watch = parseWatch(jar.get(WATCH_COOKIE)?.value);
  // GlimpseProvider wraps LibProvider: the franchise sheet (rendered by LibProvider) has glimpse buttons too.
  // One set of marks for every page and for the title popup, so a title marked anywhere is marked everywhere at once.
  const marks = Object.fromEntries(lib.map((l) => [l.key, packMark({ status: l.status, priority: l.priority, rich: l.rating > 0 || !!l.note.trim(), fresh: l.status === "watching" && l.newEp ? (l.newEp.season ? "season" : "episode") : undefined })]));
  return (
    <GlimpseProvider>
      <LibProvider packed={marks}>
      <ImportProvider>
      <WatchProvider initial={watch}>
      <Suspense fallback={null}><BgTracker /></Suspense>
      <ScrollKeeper />
      <RecheckOnce />
      <a className="skip" href="#main">Skip to content</a>
      <header className="top"><div className="top-in">
        <div className="logo"><span className="mark" aria-hidden="true" />Typecast</div>
        <Tabs where="top" />
      </div></header>
      <HeaderHeight />
      <main className="wrap" id="main" tabIndex={-1}>{children}</main>
      <Tabs where="bottom" />
      {modal}
      <PendingPopup />
      </WatchProvider>
      </ImportProvider>
      </LibProvider>
    </GlimpseProvider>
  );
}
