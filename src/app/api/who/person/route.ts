import type { NextRequest } from "next/server";
import { bad, failWho, intParam, okWho } from "@/lib/who-api";
import { loadWhoPerson } from "@/lib/who-data";
import { lineForMany } from "@/lib/spoiler-line-data";
import { lineContextFrom, NONE as NONE_LINE, revealedKeys } from "@/lib/spoiler-line";
import { holdBackCredits } from "@/lib/spoiler-mask";

/**
 * GET ?id=10131: a person's details, other profile photos and credits. A series that is Watching in the library has a spoiler line
 * (docs/features/spoilers.md): its credit comes back with no episode count and no credit ids, and a `hidden` marker. `pg`, `ps` and `reveal`
 * work as on /api/who/spans. The answer depends on the library, so it is never cached by the browser for long.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = intParam(q.get("id"));
  if (!id) return bad("Missing person");
  try {
    const p = await loadWhoPerson(id);
    const keys = p.credits.filter((c) => c.type === "tv").map((c) => c.key);
    const lines = await lineForMany(keys, lineContextFrom((n) => q.get(n)));
    for (const k of revealedKeys(q.get("reveal"), keys)) lines[k] = NONE_LINE;
    return okWho({ ...p, credits: holdBackCredits(p.credits, lines) }, 0);
  } catch (e) { return failWho(e); }
}
