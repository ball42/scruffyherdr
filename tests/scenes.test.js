import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { DEFAULT_SCENE, KIT_LAYOUT, LEGACY_LAYOUTS, isGridTree, legacyView, sceneFor, sceneOfTheme, sceneOfTree, kitLayouts } from "../herdr/mods/herdr-signals/scenes.js";
import * as scenes from "../herdr/mods/herdr-signals/scenes.js";

test("kitLayouts is the one layout", () => {
  assert.deepEqual(kitLayouts(), ["scruffy"]);
});

test("LEGACY_LAYOUTS lists the 20 old scene layouts, the older kit pair and scruffyherdr", () => {
  assert.deepEqual(LEGACY_LAYOUTS, ["tatooine", "tatooine-grid", "endor", "endor-grid", "hoth", "hoth-grid", "dagobah", "dagobah-grid", "coruscant", "coruscant-grid", "bespin", "bespin-grid", "naboo", "naboo-grid", "scarif", "scarif-grid", "kamino", "kamino-grid", "small-moon", "small-moon-grid", "kit", "kit-grid", "scruffyherdr"]);
  assert.equal(LEGACY_LAYOUTS.includes(KIT_LAYOUT), false);
});

test("legacyView reads an old scene layout name", () => {
  assert.deepEqual(legacyView("endor"), { scene: "endor", view: "focus" });
  assert.deepEqual(legacyView("small-moon-grid"), { scene: "small-moon", view: "grid" });
  assert.equal(legacyView("kit"), null, "kit and kit-grid name no scene");
  assert.equal(legacyView("scruffy"), null);
  assert.equal(legacyView("scruffyherdr"), null, "the layout's old name carries no scene");
  assert.equal(legacyView("main"), null);
  assert.equal(legacyView(undefined), null);
});

test("sceneFor takes a scene key; anything else is the default scene", () => {
  assert.equal(sceneFor("endor").label, "Endor");
  assert.equal(sceneFor("main").label, "Tatooine");
  assert.equal(sceneFor(null).label, "Tatooine");
  assert.equal(sceneFor("__proto__").label, "Tatooine");
});

test("the name-based helpers are gone", () => {
  for (const k of ["sceneOf", "isKit", "isGrid", "focusName", "gridName", "toggleName"]) assert.equal(k in scenes, false, k);
});

test("one Settings preview: herdr/layouts holds only scruffy.svg", () => {
  const dir = new URL("../herdr/layouts/", import.meta.url);
  assert.ok(existsSync(new URL("scruffy.svg", dir)));
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith(".svg")), ["scruffy.svg"]);
});

import "./support/gpui-stub.js";
const look = await import("../herdr/mods/kit-rail/look.js");
const { SCENES } = await import("../herdr/mods/herdr-signals/scenes.js");

test("look.js no longer derives scenes from layout names", () => {
  for (const k of ["KIT_SCENES", "isGridLayout", "focusLayout", "gridLayoutName"]) assert.equal(k in look, false, k);
});

test("look.js's scene table matches scenes.js: same scenes, order and needs-you colours", async () => {
  const { SCENES: all } = await import("../herdr/mods/herdr-signals/scenes.js");
  const { TONES } = await import("../herdr/mods/kit-rail/look.js");
  assert.deepEqual(Object.keys(TONES), Object.keys(all));
  for (const [name, s] of Object.entries(all)) {
    assert.equal(TONES[name].dark.orange, s.needs.dark, `${name} dark`);
    assert.equal(TONES[name].light.orange, s.needs.light, `${name} light`);
    assert.ok(TONES[name].glyph, `${name} has a needs-you glyph`);
    assert.ok(s.asks, `${name} has a strip asks glyph`);
  }
});

test("KIT_LAYOUT names the one layout", () => assert.equal(KIT_LAYOUT, "scruffy"));

test("sceneOfTree reads the scene from the theme pair", () => {
  assert.equal(sceneOfTree({ theme: { light: "kamino-day", dark: "kamino-night" } }), "kamino");
  assert.equal(sceneOfTree({ theme: { light: "naboo-day", dark: "endor-night" } }), "naboo");
  assert.equal(sceneOfTree({ theme: { light: "github-light", dark: "endor-night" } }), "endor");
  assert.equal(sceneOfTree({}), DEFAULT_SCENE);
  assert.equal(sceneOfTree(null), DEFAULT_SCENE);
  assert.equal(sceneOfTree({ theme: { light: "x", dark: "y" } }), DEFAULT_SCENE);
});

test("sceneOfTheme maps a scene theme to its scene", () => {
  assert.equal(sceneOfTheme("small-moon-day"), "small-moon");
  assert.equal(sceneOfTheme("endor-night"), "endor");
  assert.equal(sceneOfTheme("github-dark-colorblind"), null);
  assert.equal(sceneOfTheme(undefined), null);
});

test("isGridTree finds the kit-grid node anywhere", () => {
  assert.equal(isGridTree({ id: "root", children: [{ id: "a", children: [{ id: "kit-grid" }] }] }), true);
  assert.equal(isGridTree({ id: "root", children: [{ id: "main" }] }), false);
  assert.equal(isGridTree(null), false);
});
