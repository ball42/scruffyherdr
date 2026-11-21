import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import "./support/gpui-stub.js";

const look = await import("../herdr/mods/kit-rail/look.js");

test("glyphs: every scene's glyph is an exported drawing, still and unseen, in both tones", () => {
  for (const [k, t] of Object.entries(look.TONES)) {
    assert.equal(typeof look[t.glyph], "function", `${k}: no glyph function "${t.glyph}"`);
    for (const background of ["#0d1117", "#ffffff"]) {
      look.useTheme({ background }, k);
      for (const pulse of [false, true]) assert.ok(look.needsGlyph(pulse), `${k} ${background} pulse=${pulse}`);
    }
  }
});

test("glyphs: every SVG a glyph names is in kit-rail", () => {
  for (const [name, path] of Object.entries(look)) {
    if (!/_SVG$/.test(name)) continue;
    assert.ok(existsSync(new URL(`../herdr/${path}`, import.meta.url)), `${name}: ${path}`);
  }
});
