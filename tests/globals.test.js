// Mods run in Herdr's runtime, which lacks several Node globals. This test
// fails when a mod uses one as code (comments and strings are ignored).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// The core's mods, and the private add-ons' when private/ is there: they run in the same runtime.
const MOD_DIRS = [join(ROOT, "herdr", "mods"), join(ROOT, "private", "mods")].filter((d) => existsSync(d));

const BANNED = ["structuredClone", "setTimeout", "setInterval", "queueMicrotask", "process", "require", "Buffer"];

// `fetch` is not here: Herdr's AGENTS.md lists it as a mod built-in.

const STRING = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g;

/** Returns [{ line, name }] for banned identifiers used as code in `source`. */
export function findGlobals(source) {
  const hits = [];
  let inBlock = false;
  source.split("\n").forEach((raw, i) => {
    let code = raw;
    if (inBlock) {
      const end = code.indexOf("*/");
      if (end < 0) return;
      code = code.slice(end + 2);
      inBlock = false;
    }
    code = code.replace(/\/\*.*?\*\//g, " ");
    const open = code.indexOf("/*");
    if (open >= 0) {
      code = code.slice(0, open);
      inBlock = true;
    }
    code = code.replace(STRING, "''").replace(/\/\/.*$/, "");
    for (const name of BANNED) {
      // Not a property (`cx.timer`, `obj.fetch`) and not an object key (`fetch: 1`).
      const re = new RegExp(`(?<![.\\w$])${name}(?![\\w$])(?!\\s*:)`);
      if (re.test(code)) hits.push({ line: i + 1, name });
    }
  });
  return hits;
}

function modFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return modFiles(p);
    return f.endsWith(".js") ? [p] : [];
  });
}

test("scanner flags banned globals used as code", () => {
  assert.deepEqual(findGlobals("const c = structuredClone(x);"), [{ line: 1, name: "structuredClone" }]);
  assert.deepEqual(findGlobals("\n  setTimeout(f, 10);"), [{ line: 2, name: "setTimeout" }]);
  assert.deepEqual(findGlobals("const b = Buffer.from(s);"), [{ line: 1, name: "Buffer" }]);
  assert.deepEqual(findGlobals("const p = process.env.X;"), [{ line: 1, name: "process" }]);
  assert.deepEqual(findGlobals("setTimeout(f, 1);"), [{ line: 1, name: "setTimeout" }]);
});

test("scanner ignores comments, strings and properties", () => {
  const src = [
    "// structuredClone(x) in a comment",
    "/* setTimeout(f)",
    "   require('x') inside a block */",
    "const s = 'process.exit()';",
    'const t = "Buffer";',
    "const u = `fetch(${x})`;",
    "cx.timer.after(0, f); obj.process; const o = { require: 1 };",
    "const v = 1; /* Buffer */ const w = 2; // queueMicrotask(f)",
  ].join("\n");
  assert.deepEqual(findGlobals(src), []);
});

test("mods use no banned globals as code", () => {
  const offenders = [];
  for (const file of MOD_DIRS.flatMap((d) => modFiles(d))) {
    const rel = relative(ROOT, file);
    for (const hit of findGlobals(readFileSync(file, "utf8"))) {
      offenders.push(`${rel}:${hit.line} uses ${hit.name}`);
    }
  }
  assert.deepEqual(offenders, []);
});
