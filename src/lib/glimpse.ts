/**
 * One thing to look at: a heading, one or more image searches (shown as tabs) and, when we know which title / person it is,
 * `info` so the panel can also tell about them (summary, the character, which episodes). Pure; unit tested in tests/unit/glimpse.test.ts.
 */
export interface GlimpseSpec { heading: string; tabs: { label: string; q: string }[]; info?: GlimpseInfo }

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
  return { heading: `${name} as ${char}`, tabs: [{ label: "In the role", q: `${name} as ${char} ${title.title} ${title.year || ""} ${kind}`.replace(/\s+/g, " ").trim() }, ...base.tabs.map((t) => ({ ...t, label: name }))], ...info({ pid, key: keyOf(title), char }) };
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
  if (!spec.info || w.spoilers) return spec;
  const i = spec.info;
  return { ...spec, info: { ...i, nospoil: true, hide: w.title, ...(i.key === w.key.replace("-", ":") && w.clip ? { clip: { s: w.clip.s, e: w.clip.e } } : {}) } };
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
  return p.toString();
}
