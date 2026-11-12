"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/** The /watching page a popup or panel may be sitting over: its title key and whether its No spoilers switch shows spoilers. */
export interface PageLine { key: string; spoilersShown: boolean }

interface Ctx { page: PageLine | null; set: (p: PageLine | null) => void }
const PageCtx = createContext<Ctx>({ page: null, set: () => {} });

/**
 * Mounted in (app)/layout.tsx ABOVE both the page and the @modal slot, so a title popup opened over /watching (rendered outside the page's own tree) can
 * read what the page says about its own title. `WhoApp` publishes with `usePublishPageLine` and clears it on unmount. Rules: docs/features/spoilers.md.
 */
export function PageLineProvider({ children }: { children: React.ReactNode }) {
  const [page, setPage] = useState<PageLine | null>(null);
  const set = useCallback((p: PageLine | null) => setPage((cur) => (cur?.key === p?.key && cur?.spoilersShown === p?.spoilersShown ? cur : p)), []);
  const value = useMemo(() => ({ page, set }), [page, set]);
  return <PageCtx.Provider value={value}>{children}</PageCtx.Provider>;
}

/** The page the viewer is on, or null. Pass it through `pageFor(page, key)` (spoiler-line.ts) before adding pg/ps to a request. */
export const usePageLine = (): PageLine | null => useContext(PageCtx).page;

/** Publish this page's key and switch while it is mounted. */
export function usePublishPageLine(key: string, spoilersShown: boolean) {
  const { set } = useContext(PageCtx);
  useEffect(() => { set({ key, spoilersShown }); }, [set, key, spoilersShown]);
  useEffect(() => () => set(null), [set]);
}
