import { getLibrary } from "./library";
import { NONE, spoilerLine, type LineContext, type SpoilerLine } from "./spoiler-line";

/**
 * Server side of the spoiler line: reads the title's row from the library (the one cached `getLibrary()` read per request) and asks the pure
 * `spoilerLine`. If the library cannot be read the answer is `none` (today's behaviour): a database blip must not take a page down.
 */
export async function lineForMany(keys: string[], ctx: LineContext = {}): Promise<Record<string, SpoilerLine>> {
  const out: Record<string, SpoilerLine> = {};
  const tv = [...new Set(keys)].filter((k) => k.startsWith("tv:"));
  const lib = tv.length ? await getLibrary().catch(() => null) : null;
  const by = new Map((lib ?? []).map((l) => [l.key, l]));
  for (const k of keys) out[k] = lib ? spoilerLine(k, by.get(k) && { status: by.get(k)!.status, progress: by.get(k)!.progress }, ctx) : NONE;
  return out;
}

export async function lineFor(key: string, ctx: LineContext = {}): Promise<SpoilerLine> {
  return (await lineForMany([key], ctx))[key] ?? NONE;
}
