import type { NextRequest } from "next/server";
import { getFranchise } from "@/lib/tmdb";
import { pool } from "@/lib/batcher";

export const maxDuration = 30;

/**
 * POST { items: ["movie:1726", "tv:1399", …] }: the franchise groups of many titles in one request (a list of posters asks for each one's related-titles count).
 * Same answer per title as `/api/franchise?type=&id=`; the reply is newline-delimited JSON, one line per title as soon as it is known:
 * `{"i":0,"groups":[…]}`, or `{"i":0,"err":1}` for one that failed. Signed-in only (src/proxy.ts).
 */
export async function POST(req: NextRequest) {
  let items: unknown;
  try { items = ((await req.json()) as { items?: unknown }).items; } catch { items = null; }
  if (!Array.isArray(items) || items.length === 0 || items.length > 40 || items.some((x) => typeof x !== "string" || !/^(movie|tv):\d{1,9}$/.test(x))) return Response.json({ error: "Bad batch" }, { status: 400 });
  const list = items as string[];
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctl) {
      await pool(list, 6, async (k, i) => {
        const [type, id] = k.split(":");
        let line: string;
        try { line = JSON.stringify({ i, groups: await getFranchise(type as "movie" | "tv", +id) }); } catch { line = JSON.stringify({ i, err: 1 }); }
        try { ctl.enqueue(enc.encode(line + "\n")); } catch { /* the reader went away */ }
      });
      try { ctl.close(); } catch { /* closed */ }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, no-store" } });
}
