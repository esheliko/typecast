import type { NextRequest } from "next/server";
import { bad, failWho, intParam, okWho } from "@/lib/who-api";
import { loadWhoPerson } from "@/lib/who-data";

/** GET ?id=10131: a person's details, other profile photos and credits. */
export async function GET(req: NextRequest) {
  const id = intParam(req.nextUrl.searchParams.get("id"));
  if (!id) return bad("Missing person");
  try { return okWho(await loadWhoPerson(id)); } catch (e) { return failWho(e); }
}
