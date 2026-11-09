/** One thing to look at: a heading and one or more searches (shown as tabs), e.g. "Actor as Character" and "Actor". */
export interface GlimpseSpec { heading: string; tabs: { label: string; q: string }[] }

/** What to search for each kind of object. */
export const titleSpec = (t: { title: string; year?: string | number; type: string }): GlimpseSpec => {
  const kind = t.type === "tv" ? "TV series" : "film";
  const base = `${t.title} ${t.year || ""} ${kind}`.replace(/\s+/g, " ").trim();
  return { heading: `${t.title}${t.year ? ` (${t.year})` : ""}`, tabs: [{ label: "Scenes", q: `${base} scene` }, { label: "Poster", q: `${base} poster` }] };
};
export const personSpec = (name: string, dept?: string): GlimpseSpec => {
  const job = !dept || dept === "Acting" ? "actor" : dept.toLowerCase();
  return { heading: name, tabs: [{ label: "Photos", q: `${name} ${job}` }] };
};
/** A cast member, optionally as the character they play in a given title. */
export const castSpec = (name: string, role: string, title?: { title: string; year?: string | number; type: string }, dept?: string): GlimpseSpec => {
  const base = personSpec(name, dept);
  const char = role.replace(/\(.*?\)/g, "").split("/")[0].trim();
  if (!title || !char) return base;
  const kind = title.type === "tv" ? "TV series" : "film";
  return { heading: `${name} as ${char}`, tabs: [{ label: "In the role", q: `${name} as ${char} ${title.title} ${title.year || ""} ${kind}`.replace(/\s+/g, " ").trim() }, ...base.tabs.map((t) => ({ ...t, label: name }))] };
};
/** A title in an actor's filmography: their character in that title first, then the title's own scenes and poster. */
export const creditSpec = (actor: string, role: string | undefined, title: { title: string; year?: string | number; type: string }): GlimpseSpec => {
  const t = titleSpec(title);
  const char = (role ?? "").replace(/\(.*?\)/g, "").split("/")[0].trim();
  if (!char) return { heading: t.heading, tabs: [{ label: actor, q: castSpec(actor, "", title).tabs[0].q + " " + title.title }, ...t.tabs] };
  const kind = title.type === "tv" ? "TV series" : "film";
  const q = `${actor} as ${char} ${title.title} ${title.year || ""} ${kind}`.replace(/\s+/g, " ").trim();
  return { heading: `${actor} as ${char} · ${t.heading}`, tabs: [{ label: char, q }, ...t.tabs] };
};
/** A person's page opened from a title: images of them in that title first, then plain photos. */
export const personInTitleSpec = (name: string, dept: string | undefined, title?: { title: string; year?: string | number; type: string }): GlimpseSpec => {
  const base = personSpec(name, dept);
  if (!title) return base;
  const kind = title.type === "tv" ? "TV series" : "film";
  const q = `${name} ${title.title} ${title.year || ""} ${kind}`.replace(/\s+/g, " ").trim();
  return { heading: `${name} · ${title.title}`, tabs: [{ label: `In ${title.title}`, q }, ...base.tabs.map((t) => ({ ...t, label: name }))] };
};
