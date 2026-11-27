import type { NextRequest } from "next/server";
import { bad, failWho, okWho } from "@/lib/who-api";
import { answerInfo } from "@/lib/glimpse-answer";

export const maxDuration = 30;

/**
 * GET ?k=tv:79744&p=10131[&ch=Nell&c=1&s=2&e=8&ns=1&h=The+Rookie]: the About part of the Glimpse panel. A title (k), a person (p) or the person in
 * the title (both). `c=1` with s/e is the Watching-now position: nothing after it is told. `ns=1` is the No spoilers switch (shorter notes);
 * `h` is the show being watched, whose name is kept out of biographies. Signed-in only (src/proxy.ts).
 * `pg` (+ `ps=1`) names the /watching page's own title, which the page governs with `c`/`s`/`e`. Any OTHER series that is Watching in the library keeps
 * its spoiler line, decided here from the library (docs/features/spoilers.md); `full=1` (or `reveal=1`) lifts it for that view only.
 * (`/api/glimpse/infos` answers many of these questions in one request.)
 */
export async function GET(req: NextRequest) {
  try {
    const a = await answerInfo(req.nextUrl.searchParams);
    return a ? okWho(a, 0) : bad("Missing title or person");
  } catch (e) { return failWho(e); }
}
