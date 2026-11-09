import { test } from "node:test";
import assert from "node:assert/strict";
import { faceNote, filterFaces, groupFaces, movieFaces, roleLabel, seriesFaces } from "../../src/lib/roster";

const p = (id: number, name: string, role = "") => ({ id, name, photo: null, role });

test("film: leads first, cameos and 'Self' parts get their own group", () => {
  const cast = [
    ...Array.from({ length: 12 }, (_, i) => ({ ...p(i + 1, `Actor ${i + 1}`, `Role ${i + 1}`), order: i })),
    { ...p(100, "Famous Person", "Self"), order: 40 },
    { ...p(101, "Bit Part", "Waiter (uncredited)"), order: 41 },
    { ...p(102, "Late Cameo", "Cameo"), order: 3 },
  ];
  const faces = movieFaces(cast);
  const g = groupFaces(faces, "movie");
  assert.deepEqual(g.map((x) => x.id), ["cameo", "main", "minor"]);
  assert.deepEqual(g[0].faces.map((f) => f.id).sort(), [100, 101, 102]);
  assert.equal(g[1].faces.length, 10);
  assert.equal(g[2].faces.length, 2);
});

test("series: guests of later episodes are never shown", () => {
  const eps = [
    { s: 1, e: 1, guests: [p(1, "Early Guest", "Cop")] },
    { s: 1, e: 2, guests: [p(1, "Early Guest", "Cop"), p(2, "This Week", "Doctor")] },
    { s: 1, e: 3, guests: [p(3, "Future Guest", "Villain")] },
    { s: 2, e: 1, guests: [p(4, "Next Season", "Judge")] },
  ];
  const faces = seriesFaces(eps, { s: 1, e: 2 }, [p(10, "Lead", "Hero")]);
  assert.deepEqual(faces.map((f) => [f.id, f.part]), [[1, "episode"], [2, "episode"], [10, "main"]]);
  assert.equal(faces[0].count, 2);
  const later = seriesFaces(eps, { s: 1, e: 3 }, [p(10, "Lead", "Hero")]);
  assert.deepEqual(later.map((f) => [f.id, f.part]), [[3, "episode"], [1, "guest"], [2, "guest"], [10, "main"]]);
});

test("series: a recurring guest ranks above a one-off; regulars listed as guests stay regulars", () => {
  const eps = [
    { s: 1, e: 1, guests: [p(5, "Recurring", "Lawyer"), p(6, "One Off", "Waiter"), p(10, "Lead", "Hero")] },
    { s: 1, e: 2, guests: [p(5, "Recurring", "Lawyer")] },
    { s: 1, e: 3, guests: [] },
  ];
  const faces = seriesFaces(eps, { s: 1, e: 3 }, [p(10, "Lead", "Hero")]);
  assert.deepEqual(faces.map((f) => f.id), [5, 6, 10]);
  assert.equal(faceNote(faces[0]), "2 episodes, last S1 E2");
  assert.equal(faceNote(faces[1]), "Seen in S1 E1");
});

test("filter by actor, character, or the word cameo/guest", () => {
  const faces = movieFaces([{ ...p(1, "Bryan Cranston", "Walter White"), order: 0 }, { ...p(2, "Some Star", "Self"), order: 30 }]);
  assert.deepEqual(filterFaces(faces, "walter").map((f) => f.id), [1]);
  assert.deepEqual(filterFaces(faces, "cranston white").map((f) => f.id), [1]);
  assert.deepEqual(filterFaces(faces, "cameo").map((f) => f.id), [2]);
  assert.equal(filterFaces(faces, "").length, 2);
  assert.equal(filterFaces(faces, "zzz").length, 0);
});

test("role labels", () => {
  assert.equal(roleLabel("Self"), "Appears as themselves");
  assert.equal(roleLabel("Himself - Host"), "Appears as themselves - Host");
  assert.equal(roleLabel(""), "");
  assert.equal(roleLabel("Waiter (uncredited)"), "Waiter");
});
