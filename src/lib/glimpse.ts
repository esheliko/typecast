import { lineTag, pageFor, type SpoilerLine } from "./spoiler-line";

/**
 * One thing to look at: a heading, one or more image searches (shown as tabs) and, when we know which title / person it is,
 * `info` so the panel can also tell about them (summary, the character, which episodes). Pure; unit tested in tests/unit/glimpse.test.ts.
 */
export interface GlimpseSpec {
  heading: string;
  /** `info` on a tab: the About text follows that tab (a library role of the same actor) instead of the panel's own `info`. */
  tabs: GlimpseTab[];
  info?: GlimpseInfo;
  /** Also add a tab for each other role this actor plays in a title in the user's library (`/api/glimpse/roles`). Set on Watching-now cast buttons. */
  libRoles?: { actor: string };
}
export interface GlimpseTab { label: string; q: string; info?: GlimpseInfo }

/**
 * What the About part of the panel asks the server. A title (`key`), a person (`pid`) or both (that person in that title, where `char`
 * is the character as the list showed it). `clip` and `nospoil` are the Watching-now spoiler rules, see `scopeSpec`.
 */
export interface GlimpseInfo {
  /** "tv:79744" or "movie:603" */
  key?: string; pid?: number; char?: string;
  /** The show being watched, up to this position (season / episode null = not set): nothing later is told. Only set for that show. */
  clip?: { s: number | null; e: number | null };
  /** The No spoilers switch is on: say less (short character note, no counts of what is still to come). */
  nospoil?: boolean;
  /** Name of the show being watched: sentences in a biography that mention it are dropped while `nospoil`. */
  hide?: string;
  /** The /watching page this was opened on: its title key ("tv-79744") and whether its spoilers are shown. The server uses it to tell the page's own title (governed by the page) from every other title (governed by the library, see spoiler-line.ts). */
  pg?: string; ps?: boolean;
  /** Cache discriminator only (never read by the server): the spoiler line the browser expects for `key` (`lineTag`), so the About cache is keyed on the saved place. Set by `withLine`. */
  lt?: string;
}

type TitleBits = { title: string; year?: string | number; type: string; key?: string; id?: number };
const keyOf = (t: TitleBits): string | undefined => (t.key ? t.key.replace("-", ":") : t.id ? `${t.type === "tv" ? "tv" : "movie"}:${t.id}` : undefined);
const info = (i: GlimpseInfo): { info: GlimpseInfo } | Record<string, never> => (i.key || i.pid ? { info: Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined)) as GlimpseInfo } : {});

/** What to search for each kind of object. */
export const titleSpec = (t: TitleBits): GlimpseSpec => {
  const kind = t.type === "tv" ? "TV series" : "film";
  const base = `${t.title} ${t.year || ""} ${kind}`.replace(/\s+/g, " ").trim();
  return { heading: `${t.title}${t.year ? ` (${t.year})` : ""}`, tabs: [{ label: "Scenes", q: `${base} scene` }, { label: "Poster", q: `${base} poster` }], ...info({ key: keyOf(t) }) };
};
export const personSpec = (name: string, dept?: string, pid?: number): GlimpseSpec => {
  const job = !dept || dept === "Acting" ? "actor" : dept.toLowerCase();
  return { heading: name, tabs: [{ label: "Photos", q: `${name} ${job}` }], ...info({ pid }) };
};
/** The character as a list shows it ("Nell (voice) / Dr. Sawyer" -> "Nell"). */
export const charOf = (role: string | undefined): string => (role ?? "").replace(/\(.*?\)/g, "").split("/")[0].trim();

/** A cast member, optionally as the character they play in a given title. */
export const castSpec = (name: string, role: string, title?: TitleBits, dept?: string, pid?: number): GlimpseSpec => {
  const base = personSpec(name, dept, pid);
  const char = charOf(role);
  if (!title || !char) return title ? { ...base, ...info({ pid, key: keyOf(title), char: char || undefined }) } : base;
  const kind = title.type === "tv" ? "TV series" : "film";
  return { heading: `${name} as ${char}`, tabs: [{ label: char, q: `${name} as ${char} ${title.title} ${title.year || ""} ${kind}`.replace(/\s+/g, " ").trim() }, ...base.tabs.map((t) => ({ ...t, label: name }))], ...info({ pid, key: keyOf(title), char }) };
};
/** A title in an actor's filmography: their character in that title first, then the title's own scenes and poster. */
export const creditSpec = (actor: string, role: string | undefined, title: TitleBits, pid?: number): GlimpseSpec => {
  const t = titleSpec(title);
  const char = charOf(role);
  const both = info({ pid, key: keyOf(title), char: char || undefined });
  if (!char) return { heading: t.heading, tabs: [{ label: actor, q: castSpec(actor, "", title).tabs[0].q + " " + title.title }, ...t.tabs], ...both };
  const kind = title.type === "tv" ? "TV series" : "film";
  const q = `${actor} as ${char} ${title.title} ${title.year || ""} ${kind}`.replace(/\s+/g, " ").trim();
  return { heading: `${actor} as ${char} · ${t.heading}`, tabs: [{ label: char, q }, ...t.tabs], ...both };
};
/** A person's page opened from a title: images of them in that title first, then plain photos. */
export const personInTitleSpec = (name: string, dept: string | undefined, title?: TitleBits, pid?: number): GlimpseSpec => {
  const base = personSpec(name, dept, pid);
  if (!title) return base;
  const kind = title.type === "tv" ? "TV series" : "film";
  const q = `${name} ${title.title} ${title.year || ""} ${kind}`.replace(/\s+/g, " ").trim();
  return { heading: `${name} · ${title.title}`, tabs: [{ label: `In ${title.title}`, q }, ...base.tabs.map((t) => ({ ...t, label: name }))], ...info({ pid, key: keyOf(title) }) };
};

/**
 * Apply the Watching-now spoiler rules to a spec: with No spoilers on (`spoilers` false) everything is told briefly and the watched
 * show's name is kept out of biographies; for the watched show itself (`key`) nothing after the position (`clip`) is told.
 */
export function scopeSpec(spec: GlimpseSpec, w: { key: string; title: string; clip: { s: number | null; e: number | null } | null; spoilers: boolean }): GlimpseSpec {
  if (!spec.info) return spec;
  const i = spec.info;
  // The page's key goes along even when spoilers are shown: the switch lifts the line for the title being watched only, so the server must know which one that is.
  const page = { pg: w.key.replace(":", "-"), ...(w.spoilers ? { ps: true } : {}) };
  if (w.spoilers) return { ...spec, info: { ...i, ...page } };
  return { ...spec, info: { ...i, nospoil: true, hide: w.title, ...page, ...(i.key === w.key.replace("-", ":") && w.clip ? { clip: { s: w.clip.s, e: w.clip.e } } : {}) } };
}

/** The query string the About request uses (one cache key per distinct question). */
export function infoQuery(i: GlimpseInfo): string {
  const p = new URLSearchParams();
  if (i.key) p.set("k", i.key);
  if (i.pid) p.set("p", String(i.pid));
  if (i.char) p.set("ch", i.char.slice(0, 80));
  if (i.clip) { p.set("c", "1"); if (i.clip.s != null) p.set("s", String(i.clip.s)); if (i.clip.e != null) p.set("e", String(i.clip.e)); }
  if (i.nospoil) p.set("ns", "1");
  if (i.hide) p.set("h", i.hide.slice(0, 80));
  if (i.pg) { p.set("pg", i.pg); if (i.ps) p.set("ps", "1"); }
  if (i.lt) p.set("lt", i.lt);
  return p.toString();
}

/** One of the actor's other roles that sits in the user's library. */
export interface LibRole { key: string; type: "movie" | "tv"; title: string; year: string; char: string }
const MAX_LIB_ROLES = 6;

/**
 * The actor's roles in titles the user has in their library, other than the title being looked at. Skips talk-show / "Self" style credits (`extra`)
 * and credits with no character name, one tab per title. Pure; unit tested.
 */
export function libraryRoles(credits: { key: string; type: "movie" | "tv"; title: string; year: string; role: string; extra?: boolean }[], libKeys: ReadonlySet<string>, exclude?: string): LibRole[] {
  const out: LibRole[] = [];
  for (const c of credits) {
    if (out.length >= MAX_LIB_ROLES) break;
    const char = charOf(c.role);
    if (c.extra || !char || c.key === exclude || !libKeys.has(c.key) || out.some((o) => o.key === c.key)) continue;
    out.push({ key: c.key, type: c.type, title: c.title, year: c.year, char });
  }
  return out;
}

/** The tab for one library role: images of the actor as that character, and About for that role. */
export function libRoleTab(actor: string, pid: number | undefined, r: LibRole, rules?: Pick<GlimpseInfo, "nospoil" | "hide">): GlimpseTab {
  const kind = r.type === "tv" ? "TV series" : "film";
  const q = `${actor} as ${r.char} ${r.title} ${r.year || ""} ${kind}`.replace(/\s+/g, " ").trim();
  return { label: `${r.char} · ${r.title}`, q, info: info({ pid, key: r.key, char: r.char, ...(rules?.nospoil ? { nospoil: true, hide: rules.hide } : {}) }).info };
}

/** Mark a cast spec as one that also lists the actor's other library roles. */
export const withLibRoles = (spec: GlimpseSpec, actor: string): GlimpseSpec => (spec.info?.pid ? { ...spec, libRoles: { actor } } : spec);

/** The tabs to show: the spec's own, with the library roles after the first (the role being looked at). */
export function tabsWithRoles(spec: GlimpseSpec, roles: LibRole[] | null): GlimpseTab[] {
  if (!roles?.length || !spec.info?.pid || !spec.libRoles) return spec.tabs;
  const seen = new Set(spec.tabs.map((t) => t.q));
  const extra = roles.map((r) => libRoleTab(spec.libRoles!.actor, spec.info!.pid, r, spec.info)).filter((t) => !seen.has(t.q));
  return [spec.tabs[0], ...extra, ...spec.tabs.slice(1)];
}

/**
 * Make a spec ready to open from where the button sits: each question about a title gets the line the browser expects the server to use (`lt`, from the saved
 * place in the library marks: the About cache key) and, when the /watching page shows spoilers for that very title and the spec does not already name the
 * page, `pg`/`ps` so a popup of the page's own title is not gated. Pure; unit tested.
 */
export function withLine(spec: GlimpseSpec, lineOf: (key: string, page: { key: string; spoilersShown: boolean } | null) => SpoilerLine, page: { key: string; spoilersShown: boolean } | null): GlimpseSpec {
  const one = (i: GlimpseInfo | undefined): GlimpseInfo | undefined => {
    if (!i) return i;
    const own = i.pg ? { key: i.pg.replace("-", ":"), spoilersShown: !!i.ps } : pageFor(page, i.key);
    const withPage = !i.pg && own ? { ...i, pg: own.key.replace(":", "-"), ...(own.spoilersShown ? { ps: true } : {}) } : i;
    return i.key ? { ...withPage, lt: lineTag(lineOf(i.key, own)) } : withPage;
  };
  return { ...spec, ...(spec.info ? { info: one(spec.info) } : {}), tabs: spec.tabs.map((t) => (t.info ? { ...t, info: one(t.info) } : t)) };
}
