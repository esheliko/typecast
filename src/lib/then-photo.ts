/** The "Then" photos switch (Watching now cast faces) is offered only when the title is old enough for people to look different. */
export const OLD_YEARS = 8;

/** `first` is the film's release date or the series' first air date ("1981-06-12"); anything unreadable counts as not old. */
export function isOldTitle(first: string | undefined, thisYear: number, years = OLD_YEARS): boolean {
  const y = Number((first ?? "").slice(0, 4));
  return Number.isInteger(y) && y > 1800 && thisYear - y >= years;
}

/** The file name of an image URL without size or extension noise, so the same TMDB picture at two sizes compares equal. */
function imageKey(u: string): string {
  try { const p = new URL(u, "https://x.invalid").pathname; return p.slice(p.lastIndexOf("/") + 1).replace(/\.[a-z0-9]+$/i, "").toLowerCase(); } catch { return u; }
}

/** The same picture by address: identical URL, or the same file name (TMDB serves one file at several sizes). */
export function sameImageUrl(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const ka = imageKey(a), kb = imageKey(b);
  return ka.length >= 8 && ka === kb;
}

/** Difference hash of a 9x8 grayscale grid (row-major, 72 values): 64 bits saying whether each pixel is brighter than its right neighbour. */
export function dHash(gray: ArrayLike<number>): string {
  let out = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out += gray[y * 9 + x] > gray[y * 9 + x + 1] ? "1" : "0";
  return out;
}

export function hashDistance(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) d++;
  return d;
}

/** At or below this many differing bits (of 64) two photos are treated as the same picture (a crop, resize or re-encode of it). */
export const SAME_PHOTO_BITS = 18;

/** First candidate that is not the Now photo. `hashOf` may return null (image unreadable): then only the address check applies. */
export async function pickThenUrl(
  candidates: string[],
  nowUrl: string | null | undefined,
  hashOf: (url: string) => Promise<string | null>,
  limit = 6,
  /** Skip a candidate whose pixels cannot be read: it cannot be shown to differ from the Now photo. */
  strict = false,
): Promise<string | null> {
  const nowHash = nowUrl ? await hashOf(nowUrl) : null;
  const seen = new Set<string>();
  for (const url of candidates.slice(0, limit)) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (nowUrl && sameImageUrl(url, nowUrl)) continue;
    if (nowHash) {
      const h = await hashOf(url);
      if (h && hashDistance(h, nowHash) <= SAME_PHOTO_BITS) continue;
      if (!h && strict) continue;
    }
    return url;
  }
  return null;
}

/** What `rankThenImages` needs to know about one search result. `w`/`h` are the image's pixel size when the search says. */
export interface ThenCand { thumb: string; page?: string; title?: string; w?: number; h?: number }
export interface ThenWho { actor: string; char?: string; title?: string }

const words = (s: string): string[] => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 1);
const has = (hay: string, needle: string | undefined): boolean => { const n = words(needle ?? ""); const h = new Set(words(hay)); return n.length > 0 && n.every((w) => h.has(w)); };

/** Pages that hold an actor's own portrait (profile headshots, agency and fan-site galleries) rather than a picture from the work. */
const PORTRAIT_PAGE = /(imdb\.com\/(name|(?:[a-z]{2}\/)?name)\/|themoviedb\.org\/person|rottentomatoes\.com\/celebrity|wikipedia\.org|wikimedia\.org|wikidata\.org|famousbirthdays|biography\.com|tvguide\.com\/celebrities|instagram\.com|facebook\.com|twitter\.com|x\.com\/|pinterest\.|gettyimages|shutterstock|alamy|ranker\.com|fandango\.com\/people|justjared|zimbio|fanpop\.com\/(?:celebrity|people)|castingnetworks)/i;
/** Words in a result's title that say it is a portrait or an event photo, not a still. */
const PORTRAIT_WORDS = /\b(headshots?|portraits?|photoshoot|photo ?call|red carpet|premiere|arrivals?|attends?|attending|festival|comic[- ]?con|panel|interview|wallpapers?|biography|bio|height|net worth|wife|husband|girlfriend|boyfriend|instagram|profile|imdb)\b/i;
/** Pages and words that say the picture is from the show or film itself. */
const WORK_PAGE = /(fandom\.com|wikia\.|imdb\.com\/title\/|tvmaze\.com|thetvdb\.com|screenrant|tvline|ew\.com|collider|denofgeek|avclub|vulture|hollywoodreporter|deadline\.com|tvinsider|metacritic|rottentomatoes\.com\/(tv|m)\/|netflix\.com|hulu\.com|abc\.com|nbc\.com|cbs\.com|hbo\.com|max\.com|disneyplus|primevideo|screencaps?)/i;
const WORK_WORDS = /\b(season|episode|still|scene|screencaps?|finale|pilot|series|trailer|clip|character)\b/i;

/** Role names that name a job or a type, not a person: any episode's picture can carry the word, so the word proves nothing about this actor. */
const GENERIC_ROLE = new Set(["kidnapper", "cop", "officer", "policeman", "policewoman", "man", "woman", "boy", "girl", "guy", "lady", "guard", "waiter", "waitress", "guest", "doctor", "dr", "nurse", "thug", "agent", "soldier", "driver", "bartender", "reporter", "detective", "student", "extra", "background", "customer", "passenger", "teacher", "clerk", "cashier", "paramedic", "driver", "gunman", "robber", "victim", "witness", "suspect", "juror", "judge", "lawyer", "attorney", "bystander", "pedestrian", "neighbor", "neighbour", "stranger", "voice", "henchman", "goon", "worker", "employee", "receptionist", "sketchy", "young", "old", "first", "second", "third", "the", "a", "an", "of", "and", "uncredited", "self", "himself", "herself", "other", "another", "one", "two", "mr", "mrs", "ms", "miss"]);
export function isGenericRole(char: string | undefined): boolean {
  const w = (char ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
  return w.length === 0 || w.every((x) => /^\d+$/.test(x) || GENERIC_ROLE.has(x));
}
/** The result names this specific character (a generic role such as "Kidnapper 1" never counts). */
const namesChar = (hay: string, who: ThenWho): boolean => !!who.char && !isGenericRole(who.char) && has(hay, who.char);

/**
 * How likely a search result is a picture of the actor in the role rather than their own headshot: higher is better, below 0 is probably a headshot.
 * Pure; looks at the page the image sits on, the result's title and its shape. The same search ("Actor as Character Title") also returns the actor's
 * IMDb profile photo first, which defeated the purpose of a Then photo.
 */
export function thenScore(c: ThenCand, who: ThenWho): number {
  const page = c.page ?? "", title = c.title ?? "", thumb = c.thumb ?? "";
  const hay = `${title} ${page} ${thumb}`;
  let s = 0;
  if (PORTRAIT_PAGE.test(page)) s -= 4;
  if (/imdb\.com\/title\/tt\d+\/characters\/nm\d+/i.test(page)) s += 4; // IMDb's page for this actor in this title: pictures tagged with them
  else if (/imdb\.com\/title\/.*\/(mediaviewer|mediaindex)/i.test(page)) s += 1; // a title's gallery: stills, but not necessarily of this actor
  else if (WORK_PAGE.test(page)) s += 3;
  if (PORTRAIT_WORDS.test(title) && !/imdb\.com\/(?:[a-z]{2}\/)?title\/tt\d+\/characters\//i.test(page)) s -= 3; // ("- IMDb" in the title of the tagged page is not a portrait sign)
  if (/\b(imdb)\s*$/i.test(title) && !has(title, who.title)) s -= 2; // "Name - IMDb"
  if (WORK_WORDS.test(title)) s += 1;
  const t = has(hay, who.title), ch = namesChar(hay, who);
  if (t) s += 2;
  if (ch) s += 5;
  if (has(hay, who.actor) && (t || ch) && s >= 0) s += 3; // the actor's own name beside the work: the picture is tagged with them, not just any scene // the character's name is the strongest sign it is this role, above a generic scene from the show
  // A page named after the actor (a wiki's actor article, a bio) rather than the role: its picture is their portrait.
  const slug = decodeURIComponent(page).toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const cw = words(who.char ?? "").filter((w) => w.length > 2);
  if (words(who.actor).length > 1 && words(who.actor).every((w) => slug.includes(w)) && !cw.some((w) => slug.includes(w))) s -= 3;
  // Just the actor's name in the title, with nothing about the work: the profile-photo pattern.
  if (has(title, who.actor) && !t && !ch) s -= 2;
  if (c.w && c.h) {
    const r = c.w / c.h;
    if (r >= 1.3) s += 2; // a wide frame is nearly always a scene
    else if (r < 0.9) s -= /imdb\.com\/(?:[a-z]{2}\/)?title\/tt\d+\/characters\//i.test(page) ? 30 : ch ? 1 : 3; // a tall frame is a poster or a portrait; on IMDb's tagged page it is the "known for" poster collage or the show's key art (the real stills are landscape), whatever its title says; elsewhere only one naming the character is plausibly of them
    if (c.w < 200) s -= 1;
  }
  return s;
}

/**
 * Does the result show this role? Yes when it names the character (title, page address or file name), or is IMDb's tagged page for this actor in a title, or names both the actor and the show. The show's name alone is not enough on a tall or square image: that is a poster, a filmography montage or another work listed on a page
 * about the actor, and it must never stand in for the role.
 */
export function hasRoleEvidence(c: ThenCand, who: ThenWho): boolean {
  const hay = `${c.title ?? ""} ${c.page ?? ""} ${c.thumb ?? ""}`;
  if (/imdb\.com\/(?:[a-z]{2}\/)?title\/tt\d+\/characters\/nm\d+/i.test(c.page ?? "")) return true;
  if (namesChar(hay, who)) return true;
  // The show alone is not enough, even on a wide frame: that is a scene of anyone in it (a "Kidnapper 1" got another man's photo). It must name the actor too.
  if (c.w && c.h && c.w / c.h < 1.1) return false; // a poster or a square filmography montage
  return has(hay, who.title) && has(hay, who.actor) && !PORTRAIT_PAGE.test(c.page ?? "") && !PORTRAIT_WORDS.test(c.title ?? "");
}

/** Candidates best first (stable for equal scores, so the search's own order breaks ties). Strong headshot lookalikes and pictures with no tie to the role are dropped. */
export function rankThenImages<T extends ThenCand>(items: T[], who: ThenWho, floor = -3): T[] {
  return items
    .map((c, i) => ({ c, i, s: thenScore(c, who) }))
    .filter((x) => x.s > floor && hasRoleEvidence(x.c, who))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}

/**
 * Faces whose Then picture is one that other faces got too (same file): the web search sometimes hands every guest of an episode the show's key art or the
 * episode's still. A picture that stands for several people shows none of them, so those faces keep their own photo.
 */
export function sharedThenIds(m: Record<number, string | null | undefined>): Set<number> {
  const by = new Map<string, number[]>();
  for (const [id, u] of Object.entries(m)) { if (!u) continue; const k = imageKey(u).length >= 8 ? imageKey(u) : u; by.set(k, [...(by.get(k) ?? []), Number(id)]); }
  const out = new Set<number>();
  for (const ids of by.values()) if (ids.length > 1) for (const i of ids) out.add(i);
  return out;
}
