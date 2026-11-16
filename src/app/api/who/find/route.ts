import type { NextRequest } from "next/server";
import { bad, failWho, okWho } from "@/lib/who-api";
import { search, tmdb } from "@/lib/tmdb";
import { loadWhoPerson, pool } from "@/lib/who-data";
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
    // "as criminal / lawyer": TMDB has no role text, so also look at what each of their best-known titles is about (its keywords).
    const themes: Record<string, string[]> = {};
    if (found.rest.length) {
      const top = p.credits.filter((c) => !c.extra).sort((a, b) => b.votes - a.votes).slice(0, 40);
      await pool(top, 6, async (c) => {
        const d = await tmdb(`/${c.type}/${c.id}/keywords`, {}, 24 * 60 * 60).catch(() => null);
        themes[c.key] = ((c.type === "tv" ? d?.results : d?.keywords) ?? []).map((k: { name: string }) => k.name);
      });
    }
    const ms = matchCredits(p.credits, found.rest, themes);
    const keys = ms.filter((m) => m.credit.type === "tv").map((m) => m.credit.key);
    const lines = await lineForMany(keys, lineContextFrom((n) => req.nextUrl.searchParams.get(n)));
    const held = holdBackCredits(ms.map((m) => m.credit), lines);
    return okWho({ person: { id: p.id, name: p.name, photo: p.photo }, matches: ms.map((m, i) => ({ credit: held[i], role: m.role, by: m.by })) }, 0);
  } catch (e) { return failWho(e); }
}
