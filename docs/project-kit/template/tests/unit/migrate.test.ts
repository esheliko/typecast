import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain .mjs script helper
import { orderMigrations, pendingMigrations, decideBaseline, projectRef, migrationNumber } from "../../scripts/migrate-lib.mjs";

const files = ["0010_b.sql", "0002_x.sql", "README.md", "0001_init.sql", "0009_c.sql"];

test("only numbered .sql files, in filename order", () => {
  assert.deepEqual(orderMigrations(files), ["0001_init.sql", "0002_x.sql", "0009_c.sql", "0010_b.sql"]);
  assert.equal(migrationNumber("0010_film.sql"), 10);
  assert.equal(migrationNumber("notes.sql"), null);
});

test("pending = files not recorded, in order", () => {
  assert.deepEqual(pendingMigrations(files, ["0001_init.sql", "0002_x.sql"]), ["0009_c.sql", "0010_b.sql"]);
  assert.deepEqual(pendingMigrations(files, orderMigrations(files)), []);
});

test("baseline: tracking already -> nothing; flag wins; probes decide otherwise", () => {
  const probes = (hasSchema: boolean, through: number) => ({ hasSchema, through });
  assert.deepEqual(decideBaseline({ files, applied: ["0001_init.sql"], probes: probes(true, 9) }).names, []);
  assert.deepEqual(decideBaseline({ files, applied: [], probes: probes(true, 0), flag: 2 }).names, ["0001_init.sql", "0002_x.sql"]);
  assert.deepEqual(decideBaseline({ files, applied: [], probes: probes(true, 9) }).names, ["0001_init.sql", "0002_x.sql", "0009_c.sql"]);
  assert.equal(decideBaseline({ files, applied: [], probes: probes(true, 10) }).names.length, 4);
  assert.deepEqual(decideBaseline({ files, applied: [], probes: probes(false, 0) }).names, []);
  assert.ok(decideBaseline({ files, applied: [], probes: probes(true, 3) }).error);
});

test("project ref comes from the Supabase URL", () => {
  assert.equal(projectRef("https://abcd1234.supabase.co"), "abcd1234");
  assert.equal(projectRef("https://example.com"), null);
  assert.equal(projectRef(""), null);
});
