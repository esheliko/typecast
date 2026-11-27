import type { NextRequest } from "next/server";
import { answerInfo } from "@/lib/glimpse-answer";
import { pool } from "@/lib/batcher";

export const maxDuration = 30;

/**
 * POST { qs: ["k=tv:1399&p=17&ch=Tyrion&…", …] }: many `/api/glimpse/info` questions in one request (a title page's cast rows all ask at once).
 * Each query string is answered exactly as `/api/glimpse/info` would (same spoiler rules, from the library). The reply is newline-delimited JSON, one line per
 * question as soon as it is known: `{"i":0,"v":{…}}`, or `{"i":0,"err":1}` for one that failed (the others are unaffected). Signed-in only (src/proxy.ts).
 */
export async function POST(req: NextRequest) {
  let qs: unknown;
  try { qs = ((await req.json()) as { qs?: unknown }).qs; } catch { qs = null; }
  if (!Array.isArray(qs) || qs.length === 0 || qs.length > 24 || qs.some((x) => typeof x !== "string" || x.length > 700)) return Response.json({ error: "Bad batch" }, { status: 400 });
  const list = qs as string[];
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctl) {
      await pool(list, 6, async (q, i) => {
        let line: string;
        try { const a = await answerInfo(new URLSearchParams(q)); line = a ? JSON.stringify({ i, v: a }) : JSON.stringify({ i, err: 1 }); }
        catch { line = JSON.stringify({ i, err: 1 }); }
        try { ctl.enqueue(enc.encode(line + "\n")); } catch { /* the reader went away */ }
      });
      try { ctl.close(); } catch { /* closed */ }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, no-store" } });
}
