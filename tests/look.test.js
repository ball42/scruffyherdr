import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// Herdr won't let a mod import from another mod's folder, so look.js is
// copied into each kit mod. kit-rail's copy is the source.
test("kit look.js copies match kit-rail", () => {
  const src = readFileSync(new URL("../herdr/mods/kit-rail/look.js", import.meta.url), "utf8");
  for (const mod of ["kit-pane", "kit-tabs", "kit-scenes"]) {
    assert.equal(readFileSync(new URL(`../herdr/mods/${mod}/look.js`, import.meta.url), "utf8"), src, `${mod}/look.js drifted`);
  }
  // The private add-ons' copies (private/mods), when private/ is there.
  for (const mod of ["kit-day"]) {
    const url = new URL(`../private/mods/${mod}/look.js`, import.meta.url);
    if (existsSync(url)) assert.equal(readFileSync(url, "utf8"), src, `private ${mod}/look.js drifted`);
  }
});
