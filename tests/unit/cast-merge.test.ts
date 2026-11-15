import { test } from "node:test";
import assert from "node:assert/strict";
import { matchPerson, missingCast, parseTvdbCast, parseTvmazeCast, withToken, TVDB_TOKEN_MAX_AGE_MS, type TokenStore } from "../../src/lib/cast-merge";

test("tvmaze and tvdb rows parse; tvdb keeps actors only", () => {
  assert.deepEqual(parseTvmazeCast([{ person: { name: " Ever Carradine " }, character: { name: "Sheila" } }, { person: {} }]), [{ name: "Ever Carradine", role: "Sheila", source: "tvmaze" }]);
  assert.deepEqual(parseTvdbCast([{ type: 3, personName: "A B", name: "Role" }, { type: 1, personName: "Director" }, { type: 3 }]), [{ name: "A B", role: "Role", source: "tvdb" }]);
  assert.deepEqual(parseTvmazeCast(null), []);
  assert.deepEqual(parseTvdbCast("x"), []);
});

test("missingCast only adds people TMDB lacks, once, keeping a role", () => {
  const src = [
    { name: "Zoë Saldaña", role: "", source: "tvmaze" as const },
    { name: "New Person", role: "", source: "tvmaze" as const },
    { name: "new  person", role: "Jo", source: "tvdb" as const },
  ];
  const out = missingCast(["Zoe Saldana"], src);
  assert.equal(out.length, 1);
  assert.equal(out[0].role, "Jo");
});

test("matchPerson: exact name, actors, ambiguity dropped", () => {
  const h = (id: number, name: string, extra = {}) => ({ id, name, known_for_department: "Acting", ...extra });
  assert.equal(matchPerson("Ever Carradine", [h(1, "Ever Carradine")], 5)?.id, 1);
  assert.equal(matchPerson("Ever Carradine", [h(1, "Ever Carradine Jr")], 5), null);
  assert.equal(matchPerson("A B", [{ id: 2, name: "A B", known_for_department: "Directing" }], 5), null);
  assert.equal(matchPerson("A B", [h(1, "A B"), h(2, "A B")], 5), null);
  assert.equal(matchPerson("A B", [h(1, "A B"), h(2, "A B", { known_for: [{ id: 5, media_type: "tv" }] })], 5)?.id, 2);
});

test("withToken logs in when missing, reuses a fresh token, renews when old and on a 401", async () => {
  let logins = 0; let now = 1_000;
  const store: TokenStore = { token: null, at: 0 };
  const login = async () => `t${++logins}`;
  const ok = (valid: string) => async (t: string) => (t === valid ? { status: 200, body: t } : { status: 401, body: null as never });
  assert.equal(await withToken(store, login, ok("t1"), () => now), "t1");
  assert.equal(await withToken(store, login, ok("t1"), () => now), "t1");
  assert.equal(logins, 1);
  assert.equal(await withToken(store, login, ok("t2"), () => now), "t2"); // 401 -> relogin -> retry
  assert.equal(logins, 2);
  now += TVDB_TOKEN_MAX_AGE_MS + 1;
  assert.equal(await withToken(store, login, ok("t3"), () => now), "t3"); // aged out before any 401
  assert.equal(logins, 3);
  await assert.rejects(withToken(store, login, async () => ({ status: 500, body: null as never }), () => now));
  await assert.rejects(withToken(store, login, async () => ({ status: 401, body: null as never }), () => now));
});
