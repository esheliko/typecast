import type { UpEntry } from "./upcoming";

/**
 * A tiny browser-side store: the Upcoming section (which streams in after the page) hands its entries over, and Library rows read their
 * badge from it. Only ever written from an effect in the browser, so nothing is shared between requests on the server.
 */
type Entry = Pick<UpEntry, "date" | "kind" | "code" | "approx">;
let map: ReadonlyMap<string, Entry> = new Map();
const subs = new Set<() => void>();

export const setUpcomingBadges = (entries: (Entry & { key: string })[]) => {
  map = new Map(entries.map((e) => [e.key, { date: e.date, kind: e.kind, code: e.code, approx: e.approx }]));
  subs.forEach((f) => f());
};
export const subscribeBadges = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const badgeEntry = (key: string) => map.get(key);
export const badgeSnapshot = () => map;
