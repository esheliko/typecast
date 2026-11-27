import { createBatcher, readNdjson } from "./batcher";
import type { Group } from "@/components/cast/Franchise";

/**
 * Franchise groups for a title key ("movie:1726"), asked of the server. Keys asked for within ~50 ms go out as ONE request (`/api/franchise/many`, answers streamed
 * back as each is known); a lone key uses the plain cacheable `/api/franchise` call. A failed title rejects on its own and never affects the rest.
 */
export const askFranchise = createBatcher<Group[]>(async (keys, sink) => {
  if (keys.length === 1) {
    const [type, id] = keys[0].split(":");
    const r = await fetch(`/api/franchise?type=${type}&id=${id}`);
    if (!r.ok) return sink.fail(keys[0]);
    return sink.answer(keys[0], ((await r.json()) as { groups?: Group[] }).groups ?? []);
  }
  const r = await fetch("/api/franchise/many", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: keys }) });
  await readNdjson<{ i: number; groups?: Group[]; err?: number }>(r, (m) => { const k = keys[m.i]; if (k) { if (m.groups) sink.answer(k, m.groups); else sink.fail(k); } });
}, { delayMs: 50, max: 40 });
