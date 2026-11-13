import { test } from "node:test";
import assert from "node:assert/strict";
import { episodeFaces, facesText } from "../../src/lib/episode-faces";

const g = (id: number, name: string) => ({ id, name, photo: null });
const eps = [
  { e: 1, guests: [g(1, "Mara Vale"), g(2, "Tomas Reyes"), g(3, "Ines Cole"), g(4, "Omar Haddad"), g(5, "Lu Wen")] },
  { e: 2, guests: [g(1, "Mara Vale"), g(1, "Mara Vale")] },
  { e: 3, guests: [g(9, "Secret Guest")] },
];

test("top 3 and the count when nothing is held back", () => {
  const r = episodeFaces(1, eps, { kind: "none" });
  assert.deepEqual((r[0] as { names: string[] }).names, ["Mara", "Tomas", "Ines"]);
  assert.equal(facesText(r[0] as never), "Mara, Tomas, Ines +2");
  assert.equal(facesText(r[1] as never), "Mara");
});

test("never reveals the cast of episodes after the saved place", () => {
  const r = episodeFaces(1, eps, { kind: "upto", s: 1, e: 2 });
  assert.deepEqual(r[2], { e: 3, hidden: true });
  assert.ok(!JSON.stringify(r[2]).includes("Secret"));
  assert.equal(r[1].hidden, undefined);
});

test("a later season and series-only are fully hidden", () => {
  assert.ok(episodeFaces(2, eps, { kind: "upto", s: 1, e: 9 }).every((x) => x.hidden));
  assert.ok(episodeFaces(1, eps, { kind: "series-only" }).every((x) => x.hidden));
});
