import CastHome, { type HomeProps } from "@/components/cast/CastHome";
import type { Page } from "@/components/cast/Browse";
import { isActive, mergeGenres, parseBrowse } from "@/lib/browse";
import { getLibrary, getProfile } from "@/lib/library";
import { forYou } from "@/lib/foryou";
import { browse, discover, genreList, getPerson, getTitle } from "@/lib/tmdb";
import { newEpDetail } from "@/lib/new-episode";
import type { BrowseList } from "@/lib/types";

const LISTS: BrowseList[] = ["foryou", "trending", "popular", "top", "new", "soon"];
type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * The Browse tab. Browse quick lists or detailed filters with one-tap Watched / To watch on every poster,
 * and Connections between people and titles.
 * Links in: /?view=connect&a=<person id> starts a connection from that person, &t=<movie:id> from that title.
 */
export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const filters = parseBrowse(sp);
  const filtered = isActive({ ...filters, type: "all" });
  const a = one(sp.a), t = one(sp.t);

  const pick = async (): Promise<HomeProps["connect"]> => {
    try {
      if (/^\d+$/.test(a)) { const p = await getPerson(+a); return { mode: "people", a: { kind: "person", p: { id: p.id, name: p.name, photo: p.photo } } }; }
      const m = t.match(/^(movie|tv):(\d+)$/);
      if (m) { const x = await getTitle(m[1] as "movie" | "tv", +m[2]); return { mode: "titles", a: { kind: "title", t: { key: x.key, type: x.type, id: x.id, title: x.title, year: x.year, poster: x.poster } } }; }
    } catch { /* start empty */ }
    return { mode: t ? "titles" : "people", a: null };
  };
  // Everything starts at once; the first page of titles begins as soon as the library says which list to show.
  const libP = getLibrary(), profileP = getProfile();
  const salt = Math.floor(Math.random() * 1e9) + 1;
  const plan = libP.then((lib) => {
    // With a few marked titles to learn from, the home list is "For you"; otherwise Trending.
    const learn = lib.filter((l) => l.status !== "watchlist" || l.priority === "must").length >= 3;
    const list = LISTS.includes(one(sp.list) as BrowseList) ? (one(sp.list) as BrowseList) : learn ? "foryou" : "trending";
    return { lib, list };
  });
  const firstP: Promise<Page | null> = plan.then(async ({ lib, list }) => (filtered
    ? discover(filters, 1, (await profileP).country, (await profileP).services).then((r) => ({ items: r.items, page: r.page, more: r.page < r.totalPages, notice: r.notice }))
    : (list === "foryou" ? forYou(filters.type, 1, lib, salt) : browse(list, filters.type, 1)).then((r) => ({ ...r, page: 1 }))
  ).catch(() => null));
  const [{ lib, list }, profile, connect, gm, gt, first] = await Promise.all([
    plan, profileP, pick(),
    genreList("movie").catch(() => []), genreList("tv").catch(() => []),
    firstP,
  ]);

  const watching = lib.filter((l) => l.status === "watching").map((l) => ({
    key: l.key, type: l.type, id: l.id, title: l.title, year: l.year, poster: l.poster, rating: 0,
    sub: l.newEp ? newEpDetail(l.newEp) : l.progress ? `S${l.progress.s} E${l.progress.e}` : l.year,
  }));
  const view = one(sp.view) === "connect" || connect.a ? "connect" : one(sp.view) === "who" || one(sp.m) === "who" ? "who" : "browse";
  return (
    <CastHome view={view} connect={connect} watching={watching}
      browse={{ filters, filtered, list, salt, first, genres: { movie: gm, tv: gt, all: mergeGenres(gm, gt) }, canFilterMine: profile.services.length > 0 }} />
  );
}
