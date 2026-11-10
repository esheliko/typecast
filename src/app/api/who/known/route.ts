import type { NextRequest } from "next/server";
import { failWho, idList, okWho } from "@/lib/who-api";
import { loadKnown } from "@/lib/who-data";

export const maxDuration = 60;

/** GET ?ids=1,2,3: each person's best-known titles, to match against the user's marks in the browser. */
export async function GET(req: NextRequest) {
  try { return okWho({ known: await loadKnown(idList(req.nextUrl.searchParams.get("ids"), 30)) }, 3600); } catch (e) { return failWho(e); }
}
