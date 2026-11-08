import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDetails, DEFAULT_ORDER, shapeCrew, isCrewId, detailLabel, bylineLabel } from "../../src/lib/details";

test("normalizeDetails: not customized gives a fresh copy of the default", () => {
  for (const v of [null, undefined, "x", 5, {}]) {
    const out = normalizeDetails(v);
    assert.deepEqual(out, DEFAULT_ORDER);
    assert.notEqual(out, DEFAULT_ORDER);
  }
});

test("normalizeDetails keeps order, drops unknown and duplicate ids, and an empty list means hide all", () => {
  assert.deepEqual(normalizeDetails(["writer", "director", "bogus", "writer", 3, null]), ["writer", "director"]);
  assert.deepEqual(normalizeDetails([]), []);
});

test("labels differ between films and series", () => {
  assert.equal(detailLabel("director", "tv"), "Created by");
  assert.equal(detailLabel("director", "movie"), "Director");
  assert.equal(bylineLabel("director", "tv"), "Created by");
  assert.equal(bylineLabel("composer", "movie"), "Music by");
  assert.equal(isCrewId("writer"), true);
  assert.equal(isCrewId("cast_main"), false);
});

test("shapeCrew sorts a film's crew into sections", () => {
  const c = shapeCrew("movie", [
    { id: 1, name: "Dir", job: "Director" },
    { id: 2, name: "Wri", job: "Screenplay", profile_path: "/w.jpg" },
    { id: 3, name: "Mus", job: "Original Music Composer" },
    { id: 4, name: "Gaffer", job: "Gaffer" },
  ]);
  assert.deepEqual(c.director.map((x) => x.name), ["Dir"]);
  assert.equal(c.writer[0].photo, "/w.jpg");
  assert.equal(c.writer[0].role, "Screenplay");
  assert.deepEqual(c.composer.map((x) => x.name), ["Mus"]);
  assert.deepEqual(c.crew_rest.map((x) => x.role), ["Gaffer"]);
});

test("shapeCrew merges one person's roles and handles series creators", () => {
  const m = shapeCrew("movie", [{ id: 1, name: "A", job: "Director" }, { id: 1, name: "A", job: "Producer" }]);
  assert.equal(m.director.length, 1); assert.equal(m.producer.length, 1);
  const tv = shapeCrew("tv", [{ id: 9, name: "E", jobs: [{ job: "Executive Producer" }, { job: "Writer" }] }, { id: 8, name: "D", jobs: [{ job: "Director" }] }], [{ id: 7, name: "Creator" }]);
  assert.deepEqual(tv.director.map((x) => x.role), ["Creator"]);
  assert.equal(tv.producer[0].name, "E"); assert.equal(tv.writer[0].name, "E");
  assert.equal(tv.crew_rest.length, 0); // a series' episode "Director" is not shown as crew
});

test("shapeCrew caps sections and tolerates no data", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ id: i, name: `P${i}`, job: "Producer" }));
  assert.equal(shapeCrew("movie", many).producer.length, 6);
  assert.equal(shapeCrew("movie").director.length, 0);
});
