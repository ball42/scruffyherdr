// The Herdr gallery folder (herdr/): one build of the layout, its keys, recipe
// and preview, as herdr.dev/layouts lists it and an installing agent copies it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { kitKeys } from "../scripts/merge-config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const H = join(ROOT, "herdr");
const read = (f) => readFileSync(join(H, f), "utf8");

test("gallery: the checked-in layout is make-layout.js --gallery's build, byte for byte", () => {
  const built = execFileSync(process.execPath, [join(ROOT, "scripts/make-layout.js"), "--gallery"], { encoding: "utf8" });
  assert.equal(read("layouts/scruffy.json"), built);
});

test("gallery: keys.json is the kit's own bindings, global and layout:scruffy only", () => {
  const built = execFileSync(process.execPath, [join(ROOT, "scripts/make-layout.js"), "--gallery-keys"], { encoding: "utf8" });
  assert.equal(read("keys.json"), built);
  const keys = JSON.parse(read("keys.json"));
  assert.deepEqual(keys, kitKeys());
  assert.deepEqual(Object.keys(keys).sort(), ["global", "layout:scruffy"]);
});

test("gallery: every mod the layout names ships in herdr/mods, and no add-on block is placed", () => {
  const mods = new Set();
  const walk = (n) => {
    if (n?.content?.mod) mods.add(n.content.mod);
    // Pane headers name their mod one level down.
    if (n?.content?.pane?.header?.content?.mod) mods.add(n.content.pane.header.content.mod);
    (n.children ?? []).forEach(walk);
  };
  walk(JSON.parse(read("layouts/scruffy.json")));
  for (const m of mods) {
    // Herdr's own mods come with Herdr; the kit's must be in the folder.
    if (m.startsWith("kit-") || m === "herdr-signals") assert.ok(existsSync(join(H, "mods", m, "mod.json")), `${m} ships`);
  }
  for (const m of ["herdr-signals", "kit-rail", "kit-tabs", "kit-pane"]) assert.ok(mods.has(m), `the layout uses ${m}`);
  assert.equal(JSON.stringify(JSON.parse(read("layouts/scruffy.json"))).includes('"addon-'), false);
});

test("gallery: RECIPE.md has Herdr's recipe sections in order", () => {
  const md = read("RECIPE.md");
  const at = (s) => md.indexOf(s);
  const marks = ["# ", "**What you see:**", "**How it behaves:**", "**Built from:**", "**Watch out:**", "**Done when:**"];
  const where = marks.map(at);
  assert.ok(where.every((i) => i >= 0), `all present: ${marks.filter((m, i) => where[i] < 0).join(", ")}`);
  assert.deepEqual([...where].sort((a, b) => a - b), where, "in order");
  assert.ok(md.startsWith("# "), "starts with the title");
  assert.ok(md.includes("](preview.png)"), "shows the preview");
});

test("gallery: preview.png is a PNG of at most 400 KB", () => {
  const f = join(H, "preview.png");
  assert.ok(existsSync(f));
  assert.ok(statSync(f).size <= 400 * 1024, `${statSync(f).size} bytes`);
  assert.equal(readFileSync(f).subarray(1, 4).toString(), "PNG");
});
