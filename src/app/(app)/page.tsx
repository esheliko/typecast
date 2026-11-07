import CastHome, { type HomeProps } from "@/components/cast/CastHome";
import type { Query } from "@/components/cast/Browse";
import { getLibrary } from "@/lib/library";
import { browse, getPerson, getTitle } from "@/lib/tmdb";
import type { BrowseList, Mark } from "@/lib/types";

const LISTS: BrowseList[] = ["trending", "popular", "top", "new", "soon"];
type SP = Promise<{ view?: string; type?: string; list?: string; genre?: string; a?: string; t?: string }>;

/**
 * The cast tab. Browse lists with one-tap Watched / To watch on every poster, and Connections between actors and titles.
 * Links in: /?view=connect&a=<person id> starts a connection from that actor, &t=<movie:id> from that title.
 */
export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const query: Query = {
    type: sp.type === "tv" ? "tv" : "movie",
    list: LISTS.includes(sp.list as BrowseList) ? (sp.list as BrowseList) : "trending",
    genre: /^\d+$/.test(sp.genre ?? "") ? +sp.genre! : null,
  };
  const pick = async (): Promise<HomeProps["connect"]> => {
    try {
      if (sp.a && /^\d+$/.test(sp.a)) { const p = await getPerson(+sp.a); return { mode: "people", a: { kind: "person", p: { id: p.id, name: p.name, photo: p.photo } } }; }
      const m = sp.t?.match(/^(movie|tv):(\d+)$/);
      if (m) { const t = await getTitle(m[1] as "movie" | "tv", +m[2]); return { mode: "titles", a: { kind: "title", t: { key: t.key, type: t.type, id: t.id, title: t.title, year: t.year, poster: t.poster } } }; }
    } catch { /* start empty */ }
    return { mode: sp.t ? "titles" : "people", a: null };
  };
  const [lib, first, connect] = await Promise.all([
    getLibrary(),
    browse(query.list, query.type, query.genre, 1).then((r) => ({ ...r, page: 1 })).catch(() => null),
    pick(),
  ]);
  const marks: Record<string, Mark> = Object.fromEntries(lib.map((l) => [l.key, { status: l.status, rich: l.rating > 0 || !!l.note.trim() }]));
  const watching = lib.filter((l) => l.status === "watching").map((l) => ({
    key: l.key, type: l.type, id: l.id, title: l.title, year: l.year, poster: l.poster, vote: 0,
    sub: l.progress ? `S${l.progress.s} E${l.progress.e}` : l.year,
  }));
  const view = sp.view === "connect" || connect.a ? "connect" : "browse";
  return <CastHome marks={marks} view={view} query={query} first={first} connect={connect} watching={watching} />;
}
