import { intParam, titleParam } from "./who-api";
import { posFromParams } from "./who-scope";
import { loadAbout } from "./glimpse-data";
import { getLibraryItem } from "./library";
import { lineFor } from "./spoiler-line-data";
import { lineContextFrom, NONE } from "./spoiler-line";

/** The question behind `/api/glimpse/info` (one query string), shared with the batch route so both apply exactly the same spoiler rules. Throws on failure; null means a missing title or person. */
export async function answerInfo(q: URLSearchParams) {
  const t = titleParam(q.get("k"));
  const pid = intParam(q.get("p"));
  if (!t && !pid) return null;
  // `full=1`: the reader chose to see it anyway, spoilers risked: told in full, no cut at the position.
  const full = q.get("full") === "1";
  const reveal = full || q.get("reveal") === "1";
  const clip = !reveal && q.get("c") === "1" ? posFromParams(q.get("s"), q.get("e")) : null;
  // Marked Watched in the library = fully seen: only then is the whole story told.
  const [line, watched] = await Promise.all([
    t ? lineFor(`${t.type}:${t.id}`, lineContextFrom((n) => q.get(n), reveal)) : Promise.resolve(NONE),
    reveal ? Promise.resolve(true) : t ? getLibraryItem(`${t.type}:${t.id}`).then((l) => l?.status === "watched", () => false) : Promise.resolve(false),
  ]);
  return loadAbout({ watched,
    ...(t ? { type: t.type, id: t.id } : {}), ...(pid ? { pid } : {}),
    char: q.get("ch")?.trim().slice(0, 80) || undefined, clip, line, nospoil: !reveal && q.get("ns") === "1", hide: q.get("h")?.trim().slice(0, 80) || undefined,
  });
}
