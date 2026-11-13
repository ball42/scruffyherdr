import { test } from "node:test";
import assert from "node:assert/strict";
import { dress, DEFAULT_LOOK } from "../herdr/mods/herdr-signals/dress.js";
import { SCENES } from "../herdr/mods/herdr-signals/scenes.js";
import { GLASS_AREAS, glassTint } from "../herdr/mods/herdr-signals/glass.js";

const tree = () => ({
  id: "root", type: "row", background: { image: "backgrounds/old.jpg", fit: "cover" },
  children: [
    { id: "sidebar", type: "column", background: "chrome" },
    { id: "rail", type: "block", size: { px: 260 } },
    { id: "tabs", type: "block" },
    { id: "status", type: "block" },
    { id: "main", type: "block", content: { pane: { background: "card" } } },
  ],
});
const kid = (t, id) => t.children.find((c) => c.id === id);

test("dark endor gets its themes, night picture and clear chrome", () => {
  const out = dress(tree(), { scene: "endor" });
  assert.deepEqual(out.theme, { light: "endor-day", dark: "endor-night" });
  assert.deepEqual(out.background, { image: SCENES.endor.walls.dark, fit: "cover" });
  assert.equal(out.colors.chrome, "#00000000");
  assert.equal(out.preview, "layouts/scruffy.svg", "one Settings preview for every scene");
});

test("light gets the day picture and the light sidebar tint", () => {
  const out = dress(tree(), { scene: "endor", light: true });
  assert.equal(out.background.image, SCENES.endor.walls.light);
  assert.equal(kid(out, "sidebar").background, glassTint("endor", true, 0.6, "sidebar"));
});

test("a custom wallpaper stays for every scene and appearance", () => {
  for (const scene of Object.keys(SCENES)) {
    for (const light of [false, true]) {
      const out = dress(tree(), { scene, light, look: { wallpaper: "backgrounds/dunes.jpg" } });
      assert.equal(out.background.image, "backgrounds/dunes.jpg");
    }
  }
});

test("an empty wallpaper leaves the background and adds no glass", () => {
  const out = dress(tree(), { scene: "endor", look: { wallpaper: "" } });
  assert.deepEqual(out.background, tree().background);
  assert.equal(out.colors, undefined);
  assert.equal(kid(out, "sidebar").background, "chrome");
});

test("clicks land on their node and beat the defaults", () => {
  const out = dress(tree(), { scene: "endor", clicks: { rail: { size: { px: 336 } } } });
  assert.deepEqual(kid(out, "rail").size, { px: 336 });
});

test("the input tree is untouched", () => {
  const t = tree();
  dress(t, { scene: "endor", clicks: { rail: { size: { px: 1 } } } });
  assert.deepEqual(t, tree());
});

test("dressing twice is dressing once", () => {
  const o = { scene: "hoth", light: true, clicks: { rail: { size: { px: 300 } } } };
  const once = dress(tree(), o);
  assert.deepEqual(dress(once, o), once);
});

test("a bad terminal_opacity throws", () => {
  assert.throws(() => dress(tree(), { scene: "endor", look: { terminal_opacity: 2 } }), /terminal_opacity/);
});

test("terminal_opacity defaults to 0.45 and takes the look's value", () => {
  assert.equal(DEFAULT_LOOK.terminal_opacity, 0.45);
  assert.equal(dress(tree(), { scene: "endor" }).terminal_opacity, 0.45);
  assert.equal(dress(tree(), { scene: "endor", look: { terminal_opacity: 0.5 } }).terminal_opacity, 0.5);
});

test("the main pane frame turns see-through but keeps its other fields", () => {
  const t = tree();
  kid(t, "main").content.pane.radius = 10;
  const pane = kid(dress(t, { scene: "endor" }), "main").content.pane;
  assert.equal(pane.background, undefined);
  assert.equal(pane.radius, 10);
});

test("every glass area gets its tint, the rail a lighter one", () => {
  const out = dress(tree(), { scene: "hoth" });
  for (const id of GLASS_AREAS) assert.equal(kid(out, id).background, glassTint("hoth", false, 0.6, id));
  assert.notEqual(kid(out, "rail").background, kid(out, "tabs").background);
});

test("glass: false adds no chrome or tints", () => {
  const out = dress(tree(), { scene: "endor", look: { glass: false } });
  assert.equal(out.colors, undefined);
  assert.equal(kid(out, "sidebar").background, "chrome");
  assert.equal(kid(out, "tabs").background, undefined);
  assert.equal(out.background.image, SCENES.endor.walls.dark);
});

test("an unknown scene throws a clear error", () => {
  assert.throws(() => dress(tree(), { scene: "nope" }), /unknown scene: nope/);
});

import { validLook } from "../herdr/mods/herdr-signals/dress.js";

test("validLook: a bad terminal_opacity falls back to the default with one problem", () => {
  for (const bad of ["abc", 2, -0.1, Number.NaN]) {
    const { look, problems } = validLook({ terminal_opacity: bad });
    assert.equal(look.terminal_opacity, DEFAULT_LOOK.terminal_opacity);
    assert.equal(problems.length, 1, String(bad));
    assert.match(problems[0], /terminal_opacity/);
  }
  assert.match(validLook({ terminal_opacity: "abc" }).problems[0], /"abc"/);
});

test("validLook: unknown keys drop, without a problem", () => {
  const { look, problems } = validLook({ sparkle: true, terminal_opacity: 0.5 });
  assert.deepEqual(look, { terminal_opacity: 0.5 });
  assert.deepEqual(problems, []);
});

test("validLook: a good look comes back unchanged with no problems", () => {
  const good = { wallpaper: "backgrounds/mine.jpg", wallpaper_light: "backgrounds/mine-day.jpg", terminal_opacity: 0.3, glass: false };
  assert.deepEqual(validLook(good), { look: good, problems: [] });
  assert.deepEqual(validLook({ wallpaper: "", terminal_opacity: 0, glass: 1 }).problems, [], "off and edge values are good");
});

test("validLook: other bad values drop to their defaults", () => {
  const { look, problems } = validLook({ wallpaper: 3, wallpaper_light: {}, glass: 7 });
  assert.deepEqual(look, DEFAULT_LOOK);
  assert.equal(problems.length, 3);
});

test("validLook: null, missing or a non-object gives the defaults, never throws", () => {
  assert.deepEqual(validLook(null), { look: DEFAULT_LOOK, problems: [] });
  assert.deepEqual(validLook(undefined), { look: DEFAULT_LOOK, problems: [] });
  const s = validLook("loud");
  assert.deepEqual(s.look, DEFAULT_LOOK);
  assert.equal(s.problems.length, 1);
  assert.doesNotThrow(() => dress(tree(), { scene: "endor", look: validLook({ terminal_opacity: "abc" }).look }));
});
