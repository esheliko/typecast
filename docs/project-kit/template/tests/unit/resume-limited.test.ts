import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain .mjs script, no types
import { limitedSessions, candidateLine } from "../../scripts/resume-limited.mjs";

const now = Date.parse("2026-11-15T12:00:00Z");
const ago = (min: number) => new Date(now - min * 60e3).toISOString();

test("flags limit text, quiet failed/blocked; skips retired, completed, fresh, ancient", () => {
  const list = [
    { id: "a", title: "feat A", status_bucket: "working", updated_at: ago(5), post_turn_summary: { status_detail: "Hit the 5-hour limit" } },
    { id: "b", title: "feat B", status_bucket: "failed", updated_at: ago(60) },
    { id: "c", title: "💀 (retired) old", status_bucket: "failed", updated_at: ago(60) },
    { id: "d", title: "done", status_bucket: "completed", updated_at: ago(60), post_turn_summary: { status_detail: "usage limit" } },
    { id: "e", title: "just failed", status_bucket: "blocked", updated_at: ago(2) },
    { id: "f", title: "ancient", status_bucket: "failed", updated_at: ago(60 * 100) },
    { id: "g", title: "fine", status_bucket: "working", updated_at: ago(1) },
  ];
  const r = limitedSessions({ sessions: list }, { now });
  assert.deepEqual(r.map((x: { id: string }) => x.id), ["a", "b"]);
  assert.match(candidateLine(r[0]), /^a \| feat A \| limit:/);
  assert.match(r[1].reason, /^failed, quiet 60 min/);
});
