#!/usr/bin/env node
// Fails when a SERVER module imports a value (anything but a component or a type) from a "use client" module.
// Next.js only fails that at request time ("Attempted to call isSort() from the server but isSort is on the client"),
// so lint, typecheck and build all pass and the page crashes in production. Put shared helpers in src/lib instead.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const SRC = resolve("src");
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?)$/.test(n)) files.push(p);
  }
})(SRC);

const text = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
const isClient = (src) => /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/.test(src);
const clientFiles = new Set(files.filter((f) => isClient(text.get(f))));

function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const c of [base, ...[".ts", ".tsx", ".js", ".jsx"].map((e) => base + e), ...["index.ts", "index.tsx"].map((i) => join(base, i))]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const problems = [];
const IMPORT = /import\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
for (const f of files) {
  if (clientFiles.has(f)) continue; // client importing client is fine
  const src = text.get(f);
  for (const m of src.matchAll(IMPORT)) {
    if (m[1]) continue; // import type
    const target = resolveImport(f, m[3]);
    if (!target || !clientFiles.has(target)) continue;
    const named = m[2].match(/\{([\s\S]*)\}/)?.[1] ?? "";
    for (const part of named.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (part.startsWith("type ")) continue;
      const local = part.split(/\s+as\s+/).pop();
      if (!/^[A-Z]/.test(local)) {
        const line = src.slice(0, m.index).split("\n").length;
        problems.push(`${f.replace(process.cwd() + "/", "")}:${line} imports \`${part}\` from the client module ${m[3]}. A server file cannot call a function or read a value from a "use client" file; move it to src/lib.`);
      }
    }
  }
}
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log(`client boundary ok (${files.length} files, ${clientFiles.size} client)`);
