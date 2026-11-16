import type { NextRequest } from "next/server";
import { bad, failWho, okWho } from "@/lib/who-api";
import { search } from "@/lib/tmdb";
import { loadWhoPerson } from "@/lib/who-data";
import { lineForMany } from "@/lib/spoiler-line-data";
import { lineContextFrom } from "@/lib/spoiler-line";
import { holdBackCredits } from "@/lib/spoiler-mask";
import { matchCredits, splitActorQuery } from "@/lib/who-actor";

/**
 * GET ?q=george clooney as criminal: "Who's that?" with no title chosen. Finds the actor whose full name starts the query, then their credits where the rest
 * matches the character or the title. Series that are Watching keep their spoiler line (no episode counts), as on /api/who/person.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 3) return bad("Type a name");
  try {
    const w = q.split(/\s+/);
    const tries = [...new Set([w.slice(0, 2).join(" "), w.slice(0, 3).join(" "), w[0]])];
    const sets = await Promise.all(tries.map((t) => search(t, "person").catch(() => [])));
    const people = sets.flat().flatMap((h) => (h.kind === "person" ? [h] : []));
    const found = splitActorQuery(q, people);
    if (!found) return okWho({ person: null, matches: [] }, 60);
    const p = await loadWhoPerson(found.person.id);
    const ms = matchCredits(p.credits, found.rest);
    const keys = ms.filter((m) => m.credit.type === "tv").map((m) => m.credit.key);
    const lines = await lineForMany(keys, lineContextFrom((n) => req.nextUrl.searchParams.get(n)));
    const held = holdBackCredits(ms.map((m) => m.credit), lines);
    return okWho({ person: { id: p.id, name: p.name, photo: p.photo }, matches: ms.map((m, i) => ({ credit: held[i], role: m.role, by: m.by })) }, 0);
  } catch (e) { return failWho(e); }
}
