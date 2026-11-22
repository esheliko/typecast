import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain .mjs script, no types
import { commitMarker, markerSummary, markRelevant, renderMarkers } from "../../scripts/deploy-manager.mjs";

test("commitMarker: site files are blue, tooling/docs/tests are white, no file list is unclear", () => {
  assert.equal(commitMarker(["src/app/actions.ts"]), "🔵");
  assert.equal(commitMarker(["README.md", "src/lib/tmdb.ts"]), "🔵");
  assert.equal(commitMarker(["docs/x.md", "scripts/a.mjs", "tests/unit/a.test.ts", ".claude/s.sh", ".github/workflows/ci.yml", "CLAUDE.md"]), "⚪");
  assert.equal(commitMarker([]), "❓");
  assert.equal(commitMarker(undefined), "❓");
});
test("commitMarker agrees with the manager's own relevance rule", () => {
  for (const files of [["src/a.ts"], ["docs/a.md"], ["public/sw.js", "scripts/x.mjs"], ["supabase/migrations/1.sql"]]) {
    const relevant = markRelevant([{ files }], null)[0].relevant;
    assert.equal(commitMarker(files) === "🔵", relevant);
  }
});
test("markerSummary and the issue section never use red", () => {
  assert.equal(markerSummary(["🔵", ...Array(11).fill("⚪")]), "1 production change, 11 no-effect");
  assert.equal(markerSummary(["🔵", "🔵", "❓"]), "2 production changes, 1 unclear");
  assert.equal(markerSummary([]), "no commits");
  const md = renderMarkers([{ sha: "abcdef1234", marker: "🔵" }, { sha: "1234567890", marker: "⚪" }]).join("\n");
  assert.match(md, /^- `abcdef1` 🔵$/m);
  assert.doesNotMatch(md, /🔴|❌/);
});
