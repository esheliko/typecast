import type { NextRequest } from "next/server";
import { bad, failWho, intParam, okWho } from "@/lib/who-api";
import { loadPair } from "@/lib/who-data";

export const maxDuration = 60;

/** GET ?a=1&b=2: everything two people were both in. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const a = intParam(q.get("a")), b = intParam(q.get("b"));
  if (!a || !b || a === b) return bad("Two different people are needed");
  try { return okWho(await loadPair(a, b), 1800); } catch (e) { return failWho(e); }
}
