import { NextResponse } from "next/server";
import { posFromParams, parseUrlKey } from "./who-scope";
import { TmdbError } from "./tmdb";
import type { MediaType } from "./types";
import type { Pos } from "./who-types";

/** Small helpers shared by the /api/who routes: input checks (every route validates what it is given) and JSON replies. Signed-in only: src/proxy.ts answers 401 before a route runs. */
export const failWho = (e: unknown) => NextResponse.json({ error: (e as Error).message }, { status: e instanceof TmdbError ? e.status : 500 });
export const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });
export const okWho = (data: unknown, maxAge = 600) => NextResponse.json(data, { headers: { "Cache-Control": `private, max-age=${maxAge}` } });

export const intParam = (v: string | null): number | null => { const n = Number(v); return v && Number.isInteger(n) && n > 0 && n < 1e9 ? n : null; };

export function idList(v: string | null, max: number): number[] {
  return [...new Set((v ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 1e9))].slice(0, max);
}

/** "tv-79744" or "tv:79744". */
export function titleParam(v: string | null): { type: MediaType; id: number; key: string } | null {
  const k = parseUrlKey(v);
  return k ? { ...k, key: `${k.type}:${k.id}` } : null;
}

/** "tv:1418,movie:603" (at most `max`). */
export function keyList(v: string | null, max: number): string[] {
  return [...new Set((v ?? "").split(",").filter((k) => /^(movie|tv):\d{1,9}$/.test(k)))].slice(0, max);
}

export const posParam = (p: URLSearchParams): Pos => posFromParams(p.get("s"), p.get("e"));
