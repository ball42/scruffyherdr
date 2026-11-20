import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { checkAlert, deriveTones, resolveAlerts } from "../herdr/mods/herdr-signals/alerts.js";
import { DONE } from "../herdr/mods/herdr-signals/colour.js";
import { DEFAULT_SCENE, KIT_LAYOUT, LEGACY_LAYOUTS, isGridTree, legacyView, sceneFor, sceneOfTheme, sceneOfTree, kitLayouts } from "../herdr/mods/herdr-signals/scenes.js";
import * as scenes from "../herdr/mods/herdr-signals/scenes.js";

test("kitLayouts is the one layout", () => {
  assert.deepEqual(kitLayouts(), ["scruffy"]);
});

test("LEGACY_LAYOUTS lists the 20 old scene layouts, the older kit pair and scruffyherdr", () => {
  assert.deepEqual(LEGACY_LAYOUTS, ["tatooine", "tatooine-grid", "endor", "endor-grid", "hoth", "hoth-grid", "dagobah", "dagobah-grid", "coruscant", "coruscant-grid", "bespin", "bespin-grid", "naboo", "naboo-grid", "scarif", "scarif-grid", "kamino", "kamino-grid", "small-moon", "small-moon-grid", "kit", "kit-grid", "scruffyherdr"]);
  assert.equal(LEGACY_LAYOUTS.includes(KIT_LAYOUT), false);
});

test("a scene added after the one layout never names an old layout", () => {
  for (const s of Object.keys(scenes.SCENES).filter((k) => !scenes.LEGACY_SCENES.includes(k))) {
    assert.equal(LEGACY_LAYOUTS.includes(s), false, s);
    assert.equal(LEGACY_LAYOUTS.includes(`${s}-grid`), false, `${s}-grid`);
    assert.equal(legacyView(s), null, s);
    assert.equal(legacyView(`${s}-grid`), null, `${s}-grid`);
  }
  for (const s of scenes.LEGACY_SCENES) assert.ok(s in scenes.SCENES, `${s} is still a scene`);
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

test("sceneOfTheme maps the new scenes' themes", () => {
  for (const k of ["lothal", "crait", "yavin"]) {
    assert.equal(sceneOfTheme(`${k}-night`), k);
    assert.equal(sceneOfTheme(`${k}-day`), k);
  }
});

test("scenes: alert_colors reach a new scene alone", () => {
  const cfg = { scenes: { lothal: { needs: "#ffd84d" } } };
  const own = resolveAlerts(cfg, "lothal", scenes.SCENES.lothal);
  assert.deepEqual(own.problems, []);
  assert.equal(own.tones.dark.orange, "#ffd84d");
  assert.equal(resolveAlerts(cfg, "tatooine", scenes.SCENES.tatooine).tones.dark.orange, "#fd9f01");
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

// The needs-you colours picked in the swatch round (2026-11-19), night and day.
const PICKS = {
  tatooine: ["#fd9f01", "#b35900"], endor: ["#c9c510", "#8b8810"], hoth: ["#ffe5de", "#d76549"],
  dagobah: ["#b4cc1d", "#63710b"], coruscant: ["#f775ad", "#c64882"], bespin: ["#fd8a8f", "#aa4049"],
  naboo: ["#cc930d", "#ae7c04"], scarif: ["#aba700", "#8b8810"], kamino: ["#d1bc8a", "#958151"],
  mustafar: ["#ffd84d", "#8a6a00"], "asteroid-belt": ["#fd9f01", "#a76700"], "small-moon": ["#c8be9a", "#89805e"],
  lothal: ["#ffd36b", "#8a6200"], crait: ["#ff6a55", "#b3261e"],
  yavin: ["#ff8a3d", "#b04a00"],
};
const themeFile = (name) => {
  const f = JSON.parse(readFileSync(new URL(`../herdr/themes/${name}.json`, import.meta.url), "utf8"));
  return { background: f.background, foreground: f.foreground, ...f.colors };
};

test("scenes: every scene's needs is its swatch-round pick", () => {
  for (const [k, [dark, light]] of Object.entries(PICKS)) assert.deepEqual(scenes.SCENES[k].needs, { dark, light }, k);
  assert.equal(Object.keys(scenes.SCENES).length, Object.keys(PICKS).length);
});

test("scenes: TONES matches deriveTones of each needs", async () => {
  await import("./support/gpui-stub.js");
  const { TONES } = await import("../herdr/mods/kit-rail/look.js");
  for (const [k, s] of Object.entries(scenes.SCENES)) {
    for (const mode of ["dark", "light"]) {
      const want = deriveTones(s.needs[mode], mode === "light", DONE[mode]);
      for (const key of Object.keys(want)) assert.equal(TONES[k][mode][key], want[key], `${k} ${mode} ${key}`);
    }
  }
});

test("scenes: every default passes the hard checks in its own theme", () => {
  for (const [k, s] of Object.entries(scenes.SCENES)) {
    for (const [mode, file] of [["dark", "night"], ["light", "day"]]) {
      const c = checkAlert(s.needs[mode], DONE[mode], themeFile(`${k}-${file}`));
      assert.ok(c.ok, `${k} ${file}: ${JSON.stringify(c)}`);
    }
  }
});

test("scenes: no default sits within 15 of its theme's working colour", () => {
  for (const [k, s] of Object.entries(scenes.SCENES)) {
    for (const [mode, file] of [["dark", "night"], ["light", "day"]]) {
      const c = checkAlert(s.needs[mode], DONE[mode], themeFile(`${k}-${file}`));
      assert.ok(c.working >= 15, `${k} ${file}: working ${c.working.toFixed(1)}`);
    }
  }
});

test("sceneList carries each scene's resolved needs-you colours", () => {
  const list = scenes.sceneList(scenes.SCENES, { needs: "#123456", scenes: { hoth: { needs: { light: "#654321" } } } });
  assert.deepEqual(list.find((s) => s.key === "endor").needs, { dark: "#123456", light: "#123456" });
  assert.deepEqual(list.find((s) => s.key === "hoth").needs, { dark: "#123456", light: "#654321" });
  assert.deepEqual(scenes.sceneList().find((s) => s.key === "hoth").needs, scenes.SCENES.hoth.needs);
});

test("scenes: each theme's own blocked and done colours are its scene's defaults", () => {
  for (const [k, s] of Object.entries(scenes.SCENES)) {
    for (const [mode, file] of [["dark", "night"], ["light", "day"]]) {
      const c = themeFile(`${k}-${file}`);
      assert.equal(c.blocked.toLowerCase(), s.needs[mode], `${k}-${file} blocked`);
      assert.equal(c.done.toLowerCase(), DONE[mode], `${k}-${file} done`);
    }
  }
});
