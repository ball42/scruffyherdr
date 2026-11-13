import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GLASS, GLASS_AREAS, glassStrength, glassTint } from "../herdr/mods/herdr-signals/glass.js";
import { SCENES } from "../herdr/mods/herdr-signals/scenes.js";

const tree = () => ({
  id: "root", type: "row", background: { image: "backgrounds/hoth.jpg", fit: "cover" },
  children: [
    { id: "sidebar", type: "column", background: "chrome", children: [{ id: "spaces", type: "block" }] },
    { id: "work", type: "column", children: [
      { id: "tabs", type: "block" },
      { id: "work-body", type: "row", children: [{ id: "main", type: "block" }, { id: "rail", type: "block" }] },
      { id: "status", type: "row" },
    ] },
  ],
});
const bg = (t, id) => {
  const find = (n) => (n.id === id ? n : (n.children ?? []).map(find).find(Boolean));
  return find(t)?.background;
};

test("glassStrength: the default, a 0..1 number, and false for off", () => {
  assert.equal(glassStrength({}), GLASS);
  assert.equal(glassStrength({ glass: 0.4 }), 0.4);
  assert.equal(glassStrength({ glass: false }), 0);
  assert.equal(glassStrength({ glass: 7 }), GLASS, "out of range falls back");
});

test("glassTint: the scene's panel colour with alpha, the rail lighter", () => {
  assert.equal(glassTint("hoth", false, 0.6, "sidebar"), "#0f172699");
  assert.equal(glassTint("hoth", true, 0.6, "tabs"), "#f6f9fc99");
  assert.equal(glassTint("hoth", false, 0.6, "rail"), "#0f172673");
});

test("each scene's glass panel is its theme pair's background", () => {
  for (const [name, s] of Object.entries(SCENES)) {
    for (const mode of ["dark", "light"]) {
      const theme = JSON.parse(readFileSync(new URL(`../herdr/themes/${s.theme[mode]}.json`, import.meta.url), "utf8"));
      assert.equal(s.panel[mode], theme.background, `${name} ${mode}`);
    }
  }
});
