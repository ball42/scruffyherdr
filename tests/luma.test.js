import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { SCENES } from "../herdr/mods/herdr-signals/scenes.js";

// scripts/thumbs.py measures every scene picture's mean luma (Pillow "L" at
// 302 by 196) into herdr/backgrounds/luma.json, with the picture's sha256 so a
// stale number fails here; rerun it after a picture changes.
const FILE = new URL("../herdr/backgrounds/luma.json", import.meta.url);
const sha = (name) => createHash("sha256").update(readFileSync(new URL(`../herdr/backgrounds/${name}`, import.meta.url))).digest("hex");
const luma = () => JSON.parse(readFileSync(FILE, "utf8"));
const base = (wall) => wall.replace(/^backgrounds\//, "");

test("luma: every scene picture is measured", () => {
  assert.ok(existsSync(FILE), "run python3 scripts/thumbs.py");
  const l = luma();
  for (const [k, s] of Object.entries(SCENES)) {
    for (const wall of [s.walls.dark, s.walls.light]) assert.equal(typeof l[base(wall)]?.luma, "number", `${k}: ${wall}`);
  }
});

test("luma: every measurement is of the picture as it is now", () => {
  const l = luma();
  for (const [k, s] of Object.entries(SCENES)) {
    for (const wall of [s.walls.dark, s.walls.light]) {
      assert.equal(l[base(wall)]?.sha256, sha(base(wall)), `${k}: ${base(wall)} changed since it was measured; rerun python3 scripts/thumbs.py`);
    }
  }
});

test("luma: every day picture is mid-tone, so light terminal text stays readable", () => {
  const l = luma();
  for (const [k, s] of Object.entries(SCENES)) {
    const v = l[base(s.walls.light)].luma;
    assert.ok(v >= 130 && v <= 171, `${k}: ${base(s.walls.light)} luma ${v} is outside 130 to 171`);
  }
});
