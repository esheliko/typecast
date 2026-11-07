import CastHome, { type HomeProps } from "@/components/cast/CastHome";
import type { Page } from "@/components/cast/Browse";
import { isActive, parseBrowse } from "@/lib/browse";
import { getLibrary, getProfile } from "@/lib/library";
import { browse, discover, genreList, getPerson, getTitle } from "@/lib/tmdb";
import type { BrowseList, Mark } from "@/lib/types";

const LISTS: BrowseList[] = ["trending", "popular", "top", "new", "soon"];
type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * The cast tab. Browse quick lists or detailed filters with one-tap Watched / To watch on every poster,
 * and Connections between actors and titles.
 * Links in: /?view=connect&a=<person id> starts a connection from that actor, &t=<movie:id> from that title.
 */
export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const filters = parseBrowse(sp);
  const filtered = isActive({ ...filters, type: "movie" });
  const list = LISTS.includes(one(sp.list) as BrowseList) ? (one(sp.list) as BrowseList) : "trending";
  const a = one(sp.a), t = one(sp.t);

  const pick = async (): Promise<HomeProps["connect"]> => {
    try {
      if (/^\d+$/.test(a)) { const p = await getPerson(+a); return { mode: "people", a: { kind: "person", p: { id: p.id, name: p.name, photo: p.photo } } }; }
      const m = t.match(/^(movie|tv):(\d+)$/);
      if (m) { const x = await getTitle(m[1] as "movie" | "tv", +m[2]); return { mode: "titles", a: { kind: "title", t: { key: x.key, type: x.type, id: x.id, title: x.title, year: x.year, poster: x.poster } } }; }
    } catch { /* start empty */ }
    return { mode: t ? "titles" : "people", a: null };
  };
  const [lib, profile, connect, gm, gt] = await Promise.all([
    getLibrary(), getProfile(), pick(),
    genreList("movie").catch(() => []), genreList("tv").catch(() => []),
  ]);
  const first: Page | null = await (filtered
    ? discover(filters, 1, profile.country, profile.services).then((r) => ({ items: r.items, page: r.page, more: r.page < r.totalPages, notice: r.notice }))
    : browse(list, filters.type, 1).then((r) => ({ ...r, page: 1 }))
  ).catch(() => null);

  const marks: Record<string, Mark> = Object.fromEntries(lib.map((l) => [l.key, { status: l.status, rich: l.rating > 0 || !!l.note.trim() }]));
  const watching = lib.filter((l) => l.status === "watching").map((l) => ({
    key: l.key, type: l.type, id: l.id, title: l.title, year: l.year, poster: l.poster, rating: 0,
    sub: l.progress ? `S${l.progress.s} E${l.progress.e}` : l.year,
  }));
  const view = one(sp.view) === "connect" || connect.a ? "connect" : "browse";
  return (
    <CastHome marks={marks} view={view} connect={connect} watching={watching}
      browse={{ filters, filtered, list, first, genres: { movie: gm, tv: gt }, canFilterMine: profile.services.length > 0 }} />
  );
}
