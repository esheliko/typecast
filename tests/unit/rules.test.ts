import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error plain .mjs script, no types
import { validate, renderClaudeMd, renderSession, renderPrompt, replaceRegion, approxTokens, plan, BEGIN, END } from "../../scripts/build-rules.mjs";

const rule = (over = {}) => ({
  id: "a-rule", title: "T", why: "W", added: "2026-11-20", decidedBy: "owner", reviewed: "2026-11-20",
  enforcedBy: [], claudeMd: ["> one", "> two"], sessionHook: "S", promptHook: "P", ...over,
});
const doc = (rules = [rule()], budget = 1000) => ({ budget: { alwaysLoadedTokens: budget }, rules });

test("validate accepts a good file and names every problem in a bad one", () => {
  assert.deepEqual(validate(doc()), []);
  const bad = validate(doc([rule(), rule(), rule({ id: "Bad Id" }), rule({ id: "x", reviewed: "yesterday", claudeMd: "no", sessionHook: "a\nb" })]));
  assert.ok(bad.some((m: string) => m.includes("duplicate id")));
  assert.ok(bad.some((m: string) => m.includes("lowercase-kebab")));
  assert.ok(bad.some((m: string) => m.includes("YYYY-MM-DD")));
  assert.ok(bad.some((m: string) => m.includes("claudeMd")));
  assert.ok(bad.some((m: string) => m.includes("one line")));
  assert.ok(validate({ budget: {}, rules: [] }).length >= 1);
});

test("renderers keep rule order, skip empty parts and join with the right separators", () => {
  const d = doc([rule({ id: "a", claudeMd: ["> a1", "> a2"], sessionHook: "SA", promptHook: "PA" }), rule({ id: "b", claudeMd: [], sessionHook: "", promptHook: "PB" }), rule({ id: "c", claudeMd: ["> c1"], sessionHook: "SC", promptHook: "" })]);
  assert.equal(renderClaudeMd(d), "> a1\n> a2\n\n> c1");
  assert.equal(renderSession(d), "SA\nSC\n");
  assert.equal(renderPrompt(d), "REMINDERS (CLAUDE.md): PA; PB.\n");
});

test("replaceRegion swaps only the marked block and refuses a file without markers", () => {
  const text = `head\n${BEGIN}\nold\n${END}\ntail\n`;
  assert.equal(replaceRegion(text, "new"), `head\n${BEGIN}\nnew\n${END}\ntail\n`);
  assert.throws(() => replaceRegion("no markers", "x"), /markers/);
  assert.throws(() => replaceRegion(`${END}\n${BEGIN}`, "x"), /markers/);
});

test("plan reports drift and budget overflow, and is clean when in sync", () => {
  const d = doc();
  const claude = replaceRegion(`x\n${BEGIN}\n${END}\n`, renderClaudeMd(d));
  const ok = plan(d, { claude, session: renderSession(d), prompt: renderPrompt(d) });
  assert.deepEqual(ok.problems, []);
  const drift = plan(d, { claude: claude.replace("> one", "> edited by hand"), session: renderSession(d), prompt: "stale" });
  assert.equal(drift.problems.length, 2);
  assert.ok(drift.problems.every((m: string) => m.includes("out of sync")));
  const tight = plan(doc([rule()], 3), { claude, session: renderSession(d), prompt: renderPrompt(d) });
  assert.ok(tight.problems.some((m: string) => m.includes("over the budget")));
  assert.equal(approxTokens("abcd", "efgh"), 2);
});

test("the checked-in generated files match process/rules.json and fit the budget", () => {
  const d = JSON.parse(readFileSync("process/rules.json", "utf8"));
  assert.deepEqual(validate(d), []);
  const res = plan(d, {
    claude: readFileSync("CLAUDE.md", "utf8"),
    session: readFileSync(".claude/hooks/rules-session.txt", "utf8"),
    prompt: readFileSync(".claude/hooks/rules-prompt.txt", "utf8"),
  });
  assert.deepEqual(res.problems, []);
});
