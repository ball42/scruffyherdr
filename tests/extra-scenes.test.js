import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateScenes } from "../herdr/mods/herdr-signals/extra-scenes.js";

const theme = (name) => JSON.parse(readFileSync(new URL(`../herdr/themes/${name}.json`, import.meta.url), "utf8"));
// The fixture borrows an existing theme pair's colours under made-up names.
const FILES = { "fixture-night": theme("hoth-night"), "fixture-day": theme("hoth-day") };
const readTheme = (name) => FILES[name] ?? null;

const entry = () => ({
  label: "Fixture Scene",
  theme: { light: "fixture-day", dark: "fixture-night" },
  walls: { dark: "backgrounds/fixture.jpg", light: "backgrounds/fixture-day.jpg" },
  panel: { dark: "#0f1726", light: "#f6f9fc" },
  needs: { dark: "#ffe5de", light: "#d76549" },
  asks: "*",
  status: "trial",
  tones: {
    glyph: "layered",
    dark: { orange: "#ffe5de", blue: "#58a6ff", ink: "#0d1117" },
    light: { orange: "#d76549", blue: "#0969da", ink: "#ffffff" },
  },
});

test("a complete entry comes back with no problems", () => {
  const r = validateScenes({ "fixture-scene": entry() }, readTheme);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(Object.keys(r.scenes), ["fixture-scene"]);
  assert.equal(r.scenes["fixture-scene"].label, "Fixture Scene");
  assert.equal(r.scenes["fixture-scene"].tones.glyph, "layered");
});

test("a key that is a core scene is dropped", () => {
  const r = validateScenes({ hoth: entry() }, readTheme);
  assert.deepEqual(r.scenes, {});
  assert.deepEqual(r.problems, ['extra scene "hoth" clashes with a core scene']);
});

test("a key containing a colon is dropped", () => {
  const r = validateScenes({ "fix:ture": entry() }, readTheme);
  assert.deepEqual(r.scenes, {});
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /fix:ture/);
});

test("a missing field drops the entry, naming key and field", () => {
  const e = entry();
  delete e.walls.light;
  const r = validateScenes({ "fixture-scene": e }, readTheme);
  assert.deepEqual(r.scenes, {});
  assert.match(r.problems[0], /fixture-scene/);
  assert.match(r.problems[0], /walls\.light/);
});

test("a status other than trial or declined drops the entry", () => {
  const e = entry();
  e.status = "live";
  const r = validateScenes({ "fixture-scene": e }, readTheme);
  assert.deepEqual(r.scenes, {});
  assert.match(r.problems[0], /fixture-scene/);
  assert.match(r.problems[0], /status/);
});

test("declined is a valid status", () => {
  const e = entry();
  e.status = "declined";
  assert.equal(validateScenes({ "fixture-scene": e }, readTheme).scenes["fixture-scene"].status, "declined");
});

test("a needs colour that fails checkAlert drops the entry", () => {
  const e = entry();
  e.needs.dark = "#58a6ff"; // the done blue itself
  e.tones.dark.orange = "#58a6ff";
  const r = validateScenes({ "fixture-scene": e }, readTheme);
  assert.deepEqual(r.scenes, {});
  assert.match(r.problems[0], /fixture-scene/);
});

test("a theme whose blocked differs from needs drops the entry", () => {
  const e = entry();
  e.needs.light = "#b35900";
  const r = validateScenes({ "fixture-scene": e }, readTheme);
  assert.deepEqual(r.scenes, {});
  assert.match(r.problems[0], /blocked/);
});

test("a theme that can't be read drops the entry", () => {
  const e = entry();
  e.theme.dark = "nope-night";
  const r = validateScenes({ "fixture-scene": e }, readTheme);
  assert.deepEqual(r.scenes, {});
  assert.match(r.problems[0], /theme nope-night not found/);
});

test("tones need dark and light objects with orange, blue and ink", () => {
  const e = entry();
  delete e.tones.light.ink;
  const r = validateScenes({ "fixture-scene": e }, readTheme);
  assert.deepEqual(r.scenes, {});
  assert.match(r.problems[0], /tones\.light/);
});

test("a non-object raw gives no scenes and one problem", () => {
  for (const raw of [null, [], "x", 3, undefined]) {
    assert.deepEqual(validateScenes(raw, readTheme), { scenes: {}, problems: ["scene file isn't a JSON object"] });
  }
});

test("one bad entry leaves the good ones", () => {
  const r = validateScenes({ "fixture-scene": entry(), hoth: entry() }, readTheme);
  assert.deepEqual(Object.keys(r.scenes), ["fixture-scene"]);
  assert.equal(r.problems.length, 1);
});

import { loadSceneFile } from "../herdr/mods/herdr-signals/extra-scenes.js";

test("blocked and done compare case-insensitively", () => {
  const e = entry();
  e.needs.dark = e.needs.dark.toUpperCase();
  e.tones.dark.orange = e.tones.dark.orange.toUpperCase();
  const r = validateScenes({ "fixture-scene": e }, readTheme);
  assert.deepEqual(r.problems, []);
});

test("a theme whose done differs from DONE drops the entry", () => {
  const files = { ...FILES, "fixture-night": { ...FILES["fixture-night"], colors: { ...FILES["fixture-night"].colors, done: "#123456" } } };
  const r = validateScenes({ "fixture-scene": entry() }, (n) => files[n] ?? null);
  assert.deepEqual(r.scenes, {});
  assert.match(r.problems[0], /done/);
});

test("each tones colour must be #rrggbb", () => {
  for (const k of ["orange", "blue", "ink"]) {
    const e = entry();
    e.tones.dark[k] = "red";
    const r = validateScenes({ "fixture-scene": e }, readTheme);
    assert.deepEqual(r.scenes, {}, k);
    assert.match(r.problems.join(), new RegExp(`tones\\.dark\\.${k}`));
  }
});

test("tones orange must equal needs", () => {
  const e = entry();
  e.tones.light.orange = "#123456";
  const r = validateScenes({ "fixture-scene": e }, readTheme);
  assert.deepEqual(r.scenes, {});
  assert.match(r.problems.join(), /tones\.light\.orange/);
});

test("loadSceneFile: text that is missing or not JSON gives no scenes and a problem", () => {
  assert.deepEqual(loadSceneFile(null, readTheme).scenes, {});
  assert.equal(loadSceneFile(null, readTheme).problems.length, 1);
  assert.deepEqual(loadSceneFile("{nope", readTheme).scenes, {});
  assert.equal(loadSceneFile("{nope", readTheme).problems.length, 1);
  assert.deepEqual(Object.keys(loadSceneFile(JSON.stringify({ "fixture-scene": entry() }), readTheme).scenes), ["fixture-scene"]);
  assert.deepEqual(loadSceneFile("{}", readTheme), { scenes: {}, problems: [] });
});

test("tones.glyph, when set, must be \"layered\"; left out is fine", () => {
  const e = entry();
  e.tones.glyph = "suns";
  const r = validateScenes({ "fixture-scene": e }, readTheme);
  assert.deepEqual(r.scenes, {});
  assert.deepEqual(r.problems, ['extra scene "fixture-scene": tones.glyph must be "layered"']);
  const bare = entry();
  delete bare.tones.glyph;
  assert.deepEqual(validateScenes({ "fixture-scene": bare }, readTheme).problems, []);
});
