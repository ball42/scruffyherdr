import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import "./support/gpui-stub.js";

const look = await import("../herdr/mods/kit-rail/look.js");
const bgOf = (el) => el.calls.find((c) => c[0] === "bg")?.[1];

test("useTheme picks the light tone on a light background, dark otherwise", () => {
  look.useTheme({ background: "#ffffff" });
  assert.equal(look.ORANGE, "#b35900");
  assert.equal(look.BLUE, "#0969da");
  assert.equal(look.INK, "#ffffff");
  assert.equal(bgOf(look.asksBadge(["? which box?"])), "#fff1e5");

  look.useTheme({ background: "#0d1117" });
  assert.equal(look.ORANGE, "#ec8e2c");
  assert.equal(look.BLUE, "#58a6ff");
  assert.equal(look.INK, "#0d1117");
  assert.equal(bgOf(look.asksBadge(["? which box?"])), "#3a2a14");
});

test("useTheme falls back to dark without a background", () => {
  look.useTheme({ background: "#ffffff" });
  look.useTheme(undefined);
  assert.equal(look.ORANGE, "#ec8e2c");
});

test("useTheme in the Endor scene swaps orange for firefly gold, keeps blue", () => {
  look.useTheme({ background: "#0c1a18" }, "endor");
  assert.equal(look.ORANGE, "#f2c14e");
  assert.equal(look.BLUE, "#58a6ff");
  look.useTheme({ background: "#f4f8f4" }, "endor");
  assert.equal(look.ORANGE, "#8a6400");
  assert.equal(look.BLUE, "#0969da");
  look.useTheme({ background: "#0c1a18" }, "main");
  assert.equal(look.ORANGE, "#ec8e2c", "an unknown scene key gets Tatooine's");
  look.useTheme({ background: "#0c1a18" }, null);
  assert.equal(look.ORANGE, "#ec8e2c", "no scene gets Tatooine's");
});

test("the needs-you glyph is twin suns on Tatooine, a fir with fireflies on Endor", () => {
  look.useTheme({ background: "#0c1a18" }, "tatooine");
  assert.equal(look.suns(false).calls.some((c) => c[0] === "svg_path"), false);
  look.useTheme({ background: "#0c1a18" }, "endor");
  const g = look.mark("blocked", true);
  const kids = g.calls.filter((c) => c[0] === "child").map((c) => c[1]);
  assert.equal(kids[0].calls[0][1], look.TREE_SVG);
  const flies = kids.slice(1);
  assert.equal(flies.length, 3);
  assert.ok(flies.every((f) => f.calls.some((c) => c[0] === "loop")), "the fireflies breathe while unseen");
  assert.equal(bgOf(flies[0]), "#f2c14e");
  const still = look.mark("blocked", false).calls.filter((c) => c[0] === "child").slice(1);
  assert.ok(still.every(([, f]) => !f.calls.some((c) => c[0] === "loop")));
});

test("Hoth: signal coral and a snowflake whose beacon pulses while unseen", () => {
  look.useTheme({ background: "#0f1726" }, "hoth");
  assert.equal(look.ORANGE, "#ff9e7a");
  assert.equal(look.BLUE, "#58a6ff");
  const kids = look.mark("blocked", true).calls.filter((c) => c[0] === "child").map((c) => c[1]);
  assert.equal(kids[0].calls[0][1], look.FLAKE_SVG);
  assert.ok(kids[2].calls.some((c) => c[0] === "loop"), "the beacon pulses");
  look.useTheme({ background: "#f6f9fc" }, "hoth");
  assert.equal(look.ORANGE, "#b4542f");
});

test("Dagobah: a lifted rock in lantern amber over a cairn, rising while unseen", () => {
  look.useTheme({ background: "#0d1512" }, "dagobah");
  assert.equal(look.ORANGE, "#f0b45a");
  const kids = look.mark("blocked", true).calls.filter((c) => c[0] === "child").map((c) => c[1]);
  assert.equal(kids[0].calls[0][1], look.CAIRN_SVG);
  assert.equal(kids[1].calls[0][1], look.ROCK_SVG);
  assert.ok(kids[1].calls.some((c) => c[0] === "text_color" && c[1] === "#f0b45a"), "the lifted rock is the needs-you colour");
  assert.ok(kids[1].calls.some((c) => c[0] === "loop"), "the rock rises while unseen");
  const still = look.mark("blocked", false).calls.filter((c) => c[0] === "child").map((c) => c[1]);
  assert.ok(!still[1].calls.some((c) => c[0] === "loop"), "seen: the rock holds still");
  look.useTheme({ background: "#f3f4ec" }, "dagobah");
  assert.equal(look.ORANGE, "#9a5a00");
});

test("Coruscant: sodium amber and a skyline whose warning light blinks and speeder crosses while unseen", () => {
  look.useTheme({ background: "#120f22" }, "coruscant");
  assert.equal(look.ORANGE, "#ffb347");
  const kids = look.mark("blocked", true).calls.filter((c) => c[0] === "child").map((c) => c[1]);
  assert.equal(kids[0].calls[0][1], look.TOWERS_SVG);
  assert.ok(kids.slice(1).every((k) => k.calls.some((c) => c[0] === "loop")));
  look.useTheme({ background: "#f8f6fb" }, "coruscant");
  assert.equal(look.ORANGE, "#a85a00");
});

test("Bespin: landing-light gold and the floating city, its light pulsing and a cloud drifting while unseen", () => {
  look.useTheme({ background: "#161226" }, "bespin");
  assert.equal(look.ORANGE, "#ffcf5c");
  const kids = look.mark("blocked", true).calls.filter((c) => c[0] === "child").map((c) => c[1]);
  assert.equal(kids[0].calls[0][1], look.CLOUD_CITY_SVG);
  assert.ok(kids.slice(1).every((k) => k.calls.some((c) => c[0] === "loop")));
  look.useTheme({ background: "#fbf6f6" }, "bespin");
  assert.equal(look.ORANGE, "#946200");
});

test("Naboo: palace bronze and the domed palace, its window glowing and water falling while unseen", () => {
  look.useTheme({ background: "#0e1628" }, "naboo");
  assert.equal(look.ORANGE, "#ffab66");
  const kids = look.mark("blocked", true).calls.filter((c) => c[0] === "child").map((c) => c[1]);
  assert.equal(kids[0].calls[0][1], look.PALACE_SVG);
  assert.ok(kids.slice(2).every((k) => k.calls.some((c) => c[0] === "loop")));
  look.useTheme({ background: "#f5f8f4" }, "naboo");
  assert.equal(look.ORANGE, "#a3520c");
});

test("Scarif: beacon orange and a palm by the citadel tower, its beacon pulsing and surf rolling in while unseen", () => {
  look.useTheme({ background: "#0a1626" }, "scarif");
  assert.equal(look.ORANGE, "#ff9a3c");
  const kids = look.mark("blocked", true).calls.filter((c) => c[0] === "child").map((c) => c[1]);
  assert.equal(kids[0].calls[0][1], look.PALM_SVG);
  assert.ok(kids.slice(2).every((k) => k.calls.some((c) => c[0] === "loop")));
  look.useTheme({ background: "#f3f9f8" }, "scarif");
  assert.equal(look.ORANGE, "#a14a00");
});

test("Kamino: storm amber and a pod on its piers, its windows glowing and rain falling while unseen", () => {
  look.useTheme({ background: "#0b141c" }, "kamino");
  assert.equal(look.ORANGE, "#ffb84a");
  const kids = look.mark("blocked", true).calls.filter((c) => c[0] === "child").map((c) => c[1]);
  assert.equal(kids[0].calls[0][1], look.POD_SVG);
  assert.ok(kids.slice(1).every((k) => k.calls.some((c) => c[0] === "loop")));
  look.useTheme({ background: "#f2f5f7" }, "kamino");
  assert.equal(look.ORANGE, "#9a5800");
});

test("Mustafar: white-hot yellow and a cone, its crater glowing and an ember rising while unseen", () => {
  look.useTheme({ background: "#130d0b" }, "mustafar");
  assert.equal(look.ORANGE, "#ffd84d");
  let kids = look.mark("blocked", true).calls.filter((c) => c[0] === "child").map((c) => c[1]);
  assert.equal(kids[0].calls[0][1], look.CONE_SVG);
  assert.ok(kids.slice(1).every((k) => k.calls.some((c) => c[0] === "loop")));
  assert.equal(bgOf(kids[1]), "#ffd84d", "the crater in the needs-you colour");
  kids = look.mark("blocked", false).calls.filter((c) => c[0] === "child").map((c) => c[1]);
  assert.ok(kids.every((k) => !k.calls.some((c) => c[0] === "loop")), "still once seen");
  assert.ok(kids[2].calls.some((c) => c[0] === "opacity" && c[1] === 0), "the ember hides once seen");
  look.useTheme({ background: "#f8f6f3" }, "mustafar");
  assert.equal(look.ORANGE, "#8a6a00");
});

test("Asteroid Belt: comet orange and a cratered rock, the comet pulsing and a pebble drifting while unseen", () => {
  look.useTheme({ background: "#0f1318" }, "asteroid-belt");
  assert.equal(look.ORANGE, "#ff9a3c");
  let kids = look.mark("blocked", true).calls.filter((c) => c[0] === "child").map((c) => c[1]);
  assert.equal(kids[0].calls[0][1], look.ASTEROID_SVG);
  assert.ok(kids.slice(1).every((k) => k.calls.some((c) => c[0] === "loop")));
  kids = look.mark("blocked", false).calls.filter((c) => c[0] === "child").map((c) => c[1]);
  assert.ok(kids[2].calls.some((c) => c[0] === "opacity" && c[1] === 0), "the pebble hides once seen");
  look.useTheme({ background: "#f6f5f2" }, "asteroid-belt");
  assert.equal(look.ORANGE, "#a14a00");
});

test("each glyph SVG look.js names exists, with a frame and no colour of its own", () => {
  for (const name of ["TREE_SVG", "CAIRN_SVG", "ROCK_SVG", "TOWERS_SVG", "CLOUD_CITY_SVG", "PALACE_SVG", "PALM_SVG", "POD_SVG", "CONE_SVG", "ASTEROID_SVG", "FLAKE_SVG"]) {
    const url = new URL(`../herdr/${look[name]}`, import.meta.url);
    assert.ok(existsSync(url), `${look[name]} is missing`);
    const text = readFileSync(url, "utf8");
    assert.match(text, /^<svg [^>]*viewBox="0 0 \d+ \d+"/, `${name}: a frame`);
    assert.doesNotMatch(text, /#[0-9a-f]{3,6}\b|rgb\(/i, `${name}: no colour of its own`);
  }
});

const svgOf = (el) => el.calls.find((c) => c[0] === "svg_path")?.[1];
const colorOf = (el) => el.calls.find((c) => c[0] === "text_color")?.[1];
const loopsOn = (el) => el.calls.filter((c) => c[0] === "loop").map((c) => c[1]);

test("glyphLayers names a scene's layer files under Herdr's glyphs/, and nothing of what they draw", () => {
  assert.deepEqual(look.glyphLayers("small-moon"), {
    body: "glyphs/small-moon-body.svg", edge: "glyphs/small-moon-edge.svg",
    light: "glyphs/small-moon-light.svg", mover: "glyphs/small-moon-mover.svg",
  });
});

test("Small moon: reactor orange, drawn from its layer files: the light pulses and the mover crosses, only while unseen", () => {
  look.useTheme({ background: "#0a0c14" }, "small-moon");
  assert.equal(look.ORANGE, "#ff8a3d");
  const files = look.glyphLayers("small-moon");
  const childrenOf = (el) => el.calls.filter((c) => c[0] === "child").map((c) => c[1]);
  let kids = childrenOf(look.mark("blocked", true));
  assert.equal(svgOf(kids[0]), files.body);
  assert.deepEqual(childrenOf(kids[1]).map(svgOf), [files.edge, files.light], "the light over its edge, as one part");
  assert.equal(svgOf(kids[2]), files.mover);
  assert.equal(colorOf(kids[0]), "#b4bcc8", "the body in the scene's body tone");
  assert.equal(colorOf(childrenOf(kids[1])[0]), look.INK, "the edge in the ink tone, near the page's own");
  assert.equal(colorOf(childrenOf(kids[1])[1]), look.ORANGE, "the light in the needs-you colour");
  assert.equal(colorOf(kids[2]), "#ffd6b0", "the mover in the sun tone");
  assert.deepEqual(loopsOn(kids[0]), [], "the body stays still");
  assert.deepEqual(loopsOn(kids[1]), ["opacity"], "the light and its edge pulse together");
  assert.deepEqual(loopsOn(kids[2]), ["left"]);
  kids = look.mark("blocked", false).calls.filter((c) => c[0] === "child").map((c) => c[1]);
  assert.ok(kids.every((k) => loopsOn(k).length === 0), "nothing moves once seen");
  assert.ok(kids[2].calls.some((c) => c[0] === "opacity" && c[1] === 0), "the mover hides once seen");
  look.useTheme({ background: "#f4f5f7" }, "small-moon");
  assert.equal(look.ORANGE, "#a24800");
  kids = childrenOf(look.mark("blocked", true));
  assert.equal(colorOf(kids[0]), "#5a6474");
  assert.equal(colorOf(childrenOf(kids[1])[1]), "#a24800");
});

test("each layer file look.js names is in herdr/glyphs/, a one-colour SVG Herdr can tint", () => {
  const layers = Object.values(look.glyphLayers("small-moon"));
  const roots = [new URL("../herdr/", import.meta.url), new URL("../private/herdr/", import.meta.url)];
  for (const rel of layers) {
    for (const [i, root] of roots.entries()) {
      const url = new URL(rel, root);
      if (i > 0 && !existsSync(new URL("glyphs/", root))) continue; // no private/ in the public cut
      assert.ok(existsSync(url), `${url.pathname} is missing`);
      const text = readFileSync(url, "utf8");
      assert.match(text, /^<svg [^>]*viewBox="0 0 14 14"/, `${rel}: a 14 by 14 frame`);
      assert.doesNotMatch(text, /#[0-9a-f]{3,6}\b|rgb\(/i, `${rel}: no colour of its own, so the tint shows`);
    }
  }
});

test("look.js names the glyph's layer files, never what's drawn in them", () => {
  const src = readFileSync(new URL("../herdr/mods/kit-rail/look.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /station|dish|fighter|trench|hull/i);
});

test("the open-item badge's glyph pulses only when asked, so it can stand in for a blocked card's glyph", () => {
  look.useTheme({ background: "#0d1117" }, "small-moon");
  const loops = (el) => el.calls.some((c) => c[0] === "loop") || el.calls.some((c) => c[0] === "child" && c[1]?.calls && loops(c[1]));
  const glyphOf = (badge) => badge.calls.filter((c) => c[0] === "child")[0][1];
  assert.ok(loops(glyphOf(look.asksBadge(["? which box?"], false, true))), "pulses while unseen");
  assert.ok(!loops(glyphOf(look.asksBadge(["? which box?"]))), "still by default");
});

test("the kit's Small Moon glyph is its own art: no layer copies the overlay's", () => {
  const priv = new URL("../private/herdr/glyphs/", import.meta.url);
  if (!existsSync(priv)) return; // the public cut has no overlay
  for (const rel of Object.values(look.glyphLayers("small-moon"))) {
    const name = rel.replace("glyphs/", "");
    const kit = readFileSync(new URL(`../herdr/glyphs/${name}`, import.meta.url), "utf8");
    assert.notEqual(kit, readFileSync(new URL(name, priv), "utf8"), `herdr/glyphs/${name} is the overlay's art`);
  }
});
