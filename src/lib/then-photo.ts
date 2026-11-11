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
export const SAME_PHOTO_BITS = 14;

/** First candidate that is not the Now photo. `hashOf` may return null (image unreadable): then only the address check applies. */
export async function pickThenUrl(
  candidates: string[],
  nowUrl: string | null | undefined,
  hashOf: (url: string) => Promise<string | null>,
  limit = 6,
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
    }
    return url;
  }
  return null;
}
