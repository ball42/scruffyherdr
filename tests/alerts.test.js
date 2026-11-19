import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkAlert, deriveTones, resolveAlerts } from "../herdr/mods/herdr-signals/alerts.js";
import { DONE, contrast } from "../herdr/mods/herdr-signals/colour.js";
import { SCENES } from "../herdr/mods/herdr-signals/scenes.js";

const themeColors = (name) => {
  const f = JSON.parse(readFileSync(new URL(`../herdr/themes/${name}.json`, import.meta.url), "utf8"));
  return { background: f.background, foreground: f.foreground, ...f.colors };
};

test("deriveTones: Mustafar's yellow at night", () => {
  const t = deriveTones("#ffd84d", false, DONE.dark);
  assert.equal(t.orange, "#ffd84d");
  assert.equal(t.blue, "#58a6ff");
  assert.equal(t.ink, "#0d1117");
  assert.ok(contrast(t.ink, t.orange) >= 4.5);
  for (const k of ["sun", "count", "badge"]) assert.match(t[k], /^#[0-9a-f]{6}$/);
});

test("deriveTones: light count is darker than the needs-you colour", () => {
  const t = deriveTones("#b35900", true, DONE.light);
  assert.equal(t.blue, "#0969da");
  assert.ok(contrast(t.count, "#ffffff") > contrast(t.orange, "#ffffff"));
});

test("resolveAlerts: no overrides gives the scene defaults", () => {
  const r = resolveAlerts({}, "hoth", SCENES.hoth);
  assert.equal(r.tones.dark.orange, SCENES.hoth.needs.dark);
  assert.equal(r.tones.light.orange, SCENES.hoth.needs.light);
  assert.equal(r.tones.dark.blue, DONE.dark);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(resolveAlerts(undefined, "hoth", SCENES.hoth).tones, r.tones);
});

test("resolveAlerts: one hex sets both modes; {light} changes light only", () => {
  const both = resolveAlerts({ needs: "#123456" }, "hoth", SCENES.hoth).tones;
  assert.equal(both.dark.orange, "#123456");
  assert.equal(both.light.orange, "#123456");
  const lightOnly = resolveAlerts({ needs: { light: "#654321" } }, "hoth", SCENES.hoth).tones;
  assert.equal(lightOnly.light.orange, "#654321");
  assert.equal(lightOnly.dark.orange, SCENES.hoth.needs.dark);
});

test("resolveAlerts: a scene entry beats the global one", () => {
  const cfg = { scenes: { hoth: { needs: "#abcdef" } }, needs: "#123456" };
  assert.equal(resolveAlerts(cfg, "hoth", SCENES.hoth).tones.dark.orange, "#abcdef");
  assert.equal(resolveAlerts(cfg, "endor", SCENES.endor).tones.dark.orange, "#123456");
});

test("resolveAlerts: a done override changes blue in both modes", () => {
  const t = resolveAlerts({ done: "#00aaff" }, "hoth", SCENES.hoth).tones;
  assert.equal(t.dark.blue, "#00aaff");
  assert.equal(t.light.blue, "#00aaff");
});

test("resolveAlerts: a bad value or unknown scene keeps the defaults and names one problem", () => {
  const bad = resolveAlerts({ needs: "orange" }, "hoth", SCENES.hoth);
  assert.equal(bad.tones.dark.orange, SCENES.hoth.needs.dark);
  assert.equal(bad.problems.length, 1);
  assert.match(bad.problems[0], /orange/);
  const typo = resolveAlerts({ scenes: { hot: { needs: "#ffffff" } } }, "hoth", SCENES.hoth);
  assert.equal(typo.tones.dark.orange, SCENES.hoth.needs.dark);
  assert.equal(typo.problems.length, 1);
  assert.match(typo.problems[0], /hot/);
});

test("checkAlert: Mustafar's yellow passes in its night theme", () => {
  const c = checkAlert("#ffd84d", DONE.dark, themeColors("mustafar-night"));
  assert.equal(c.ok, true);
  assert.ok(c.done >= 20 && c.fill >= 3 && c.bar >= 15);
  assert.equal(typeof c.working, "number");
});

test("checkAlert: done-blue as needs-you fails", () => {
  assert.equal(checkAlert("#58a6ff", DONE.dark, themeColors("mustafar-night")).ok, false);
});
