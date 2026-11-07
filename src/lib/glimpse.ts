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
