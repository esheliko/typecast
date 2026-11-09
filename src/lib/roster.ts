import type { MediaType } from "./types";

/**
 * "Who's that?": the faces that can be on screen right now, sorted into the groups a viewer actually thinks in
 * ("a guest in this episode", "someone who showed up earlier", "a cameo"). Pure; unit tested in tests/unit/roster.test.ts.
 */
export type Part = "episode" | "guest" | "main" | "cameo" | "minor" | "other";

export interface Face {
  id: number; name: string; photo: string | null; role: string; part: Part;
  /** Series guests: episodes they appear in up to the episode being watched, and the first and latest of them ("S1 E4"). */
  count?: number; first?: string; last?: string;
}

/** Credits that are the actor playing themselves, or not credited: the classic cameo. */
export const CAMEO = /\b(cameo|himself|herself|themselves|self|uncredited|archive footage|special appearance|special guest)\b/i;

/** "Self" is a bare label; say what it means. Otherwise the character, tidied. */
export function roleLabel(role: string): string {
  const r = role.replace(/\s*\((uncredited|archive footage)\)\s*/gi, " ").replace(/\s+/g, " ").trim();
  if (!r) return CAMEO.test(role) ? "Uncredited" : "";
  if (/^(self|himself|herself|themselves)$/i.test(r)) return "Appears as themselves";
  if (/^(self|himself|herself|themselves)\b/i.test(r)) return `Appears as themselves ${r.replace(/^\w+\s*/, "")}`.trim();
  return r;
}

/** A film's cast: the leads first, then cameos and "as themselves" parts, then everyone else in billing order. */
export function movieFaces(cast: { id: number; name: string; photo: string | null; role: string; order: number }[]): Face[] {
  const sorted = [...cast].sort((a, b) => a.order - b.order);
  let mains = 0;
  return sorted.map((c): Face => {
    const cameo = CAMEO.test(c.role);
    const part: Part = cameo ? "cameo" : mains < 10 ? (mains++, "main") : "minor";
    return { id: c.id, name: c.name, photo: c.photo, role: c.role, part };
  });
}

export interface EpGuests { s: number; e: number; guests: { id: number; name: string; photo: string | null; role: string }[] }
const at = (s: number, e: number) => `S${s} E${e}`;
const before = (a: { s: number; e: number }, b: { s: number; e: number }) => a.s < b.s || (a.s === b.s && a.e <= b.e);

/**
 * Series faces for someone at season `s`, episode `e`: this episode's guests, guests of every earlier episode (never a later one,
 * so nobody is given away), then the regulars. Guests who came back are ordered by how often they have appeared.
 */
export function seriesFaces(eps: EpGuests[], now: { s: number; e: number }, regulars: { id: number; name: string; photo: string | null; role: string }[]): Face[] {
  const byId = new Map<number, Face>();
  const reg = new Set(regulars.map((r) => r.id));
  for (const ep of [...eps].filter((x) => before(x, now)).sort((a, b) => a.s - b.s || a.e - b.e)) {
    const here = ep.s === now.s && ep.e === now.e;
    for (const g of ep.guests) {
      if (reg.has(g.id) && !here) continue; // a regular listed as a guest once is still a regular
      const f = byId.get(g.id);
      if (!f) { byId.set(g.id, { id: g.id, name: g.name, photo: g.photo, role: g.role, part: here ? "episode" : "guest", count: 1, first: at(ep.s, ep.e), last: at(ep.s, ep.e) }); continue; }
      f.count = (f.count ?? 1) + 1; f.last = at(ep.s, ep.e);
      if (here) f.part = "episode";
      if (g.role && !f.role.includes(g.role) && f.role.length < 60) f.role = f.role ? `${f.role} / ${g.role}` : g.role;
    }
  }
  const guests = [...byId.values()].filter((f) => !reg.has(f.id) || f.part === "episode");
  const rank = (f: Face) => (f.part === "episode" ? 0 : 1);
  guests.sort((a, b) => rank(a) - rank(b) || (b.count ?? 1) - (a.count ?? 1));
  const seen = new Set(guests.map((g) => g.id));
  const mains = regulars.filter((r) => !seen.has(r.id)).map((r): Face => ({ ...r, part: "main" }));
  return [...guests, ...mains];
}

export interface Group { id: Part; label: string; hint?: string; faces: Face[] }

/** The sections shown, in order, skipping empty ones. */
export function groupFaces(faces: Face[], type: MediaType): Group[] {
  const spec: [Part, string, string?][] = type === "tv"
    ? [["episode", "Guest stars in this episode", "Not in the main cast: the likeliest answer for an unfamiliar face"], ["guest", "Showed up earlier", "Guests from earlier episodes, up to here"], ["main", "Series regulars"], ["other", "Elsewhere in the series", "May appear later, so possibly a spoiler"]]
    : [["cameo", "Cameos and appearances as themselves", "Credited as themselves or uncredited"], ["main", "Main cast"], ["minor", "Supporting and small parts"]];
  return spec.map(([id, label, hint]): Group => ({ id, label, hint, faces: faces.filter((f) => f.part === id) })).filter((g) => g.faces.length);
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Faces whose name or character contains every word typed; words like "cameo" or "guest" also match the group. */
export function filterFaces(faces: Face[], q: string): Face[] {
  const words = norm(q).split(" ").filter(Boolean);
  if (!words.length) return faces;
  return faces.filter((f) => {
    const hay = ` ${norm(f.name)} ${norm(f.role)} ${f.part === "cameo" ? "cameo" : f.part === "episode" || f.part === "guest" ? "guest" : ""} `;
    return words.every((w) => hay.includes(` ${w}`) || hay.includes(w));
  });
}

/** Where a face is, in words, for the line under a name. */
export function faceNote(f: Face): string {
  if (f.part === "episode") return f.count && f.count > 1 ? `In this episode · ${f.count} so far` : "In this episode";
  if (f.part === "guest") return f.count && f.count > 1 ? `${f.count} episodes, last ${f.last}` : `Seen in ${f.first}`;
  return "";
}
