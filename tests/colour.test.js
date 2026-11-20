import { test } from "node:test";
import assert from "node:assert/strict";
import { DONE, contrast, deltaE, deltaELab, deltaESim, deuteranope, mix } from "../herdr/mods/herdr-signals/colour.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b}`);
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

test("contrast: black on white is 21, a colour on itself is 1", () => {
  near(contrast("#000000", "#ffffff"), 21, 0.01);
  near(contrast("#58a6ff", "#58a6ff"), 1, 1e-9);
});

test("deltaELab matches Sharma's CIEDE2000 test pair", () => {
  near(deltaELab([50, 2.6772, -79.7751], [50, 0, -82.7485]), 2.0425, 0.001);
});

test("deltaE: a colour against itself is 0", () => {
  near(deltaE("#ec8e2c", "#ec8e2c"), 0, 1e-9);
});

test("deuteranope keeps white and black", () => {
  rgb(deuteranope("#ffffff")).forEach((c) => near(c, 255, 1));
  assert.equal(deuteranope("#000000"), "#000000");
});

test("deltaESim: Tatooine's violet accent collapses to done-blue, Scarif's teal holds", () => {
  assert.ok(deltaESim("#b9a3e6", "#58a6ff") < 15);
  assert.ok(deltaESim("#5fd4d0", "#58a6ff") > 15);
});

test("mix: the ends and clamping", () => {
  assert.equal(mix("#000000", "#ffffff", 0), "#000000");
  assert.equal(mix("#000000", "#ffffff", 1), "#ffffff");
  assert.equal(mix("#000000", "#ffffff", -2), "#000000");
  assert.equal(mix("#000000", "#ffffff", 7), "#ffffff");
});

test("DONE is the kit's done-blue", () => {
  assert.deepEqual(DONE, { dark: "#58a6ff", light: "#0969da" });
});

import { readFileSync, readdirSync } from "node:fs";
import { hereTones } from "../herdr/mods/herdr-signals/colour.js";
import { SCENES } from "../herdr/mods/herdr-signals/scenes.js";

const themeColors = (name) => {
  const f = JSON.parse(readFileSync(new URL(`../herdr/themes/${name}.json`, import.meta.url), "utf8"));
  return { background: f.background, foreground: f.foreground, ...f.colors };
};

test("hereTones: Scarif night keeps its teal accent for the bar", () => {
  assert.equal(hereTones(themeColors("scarif-night"), SCENES.scarif.needs).here, "#5fd4d0");
});

test("hereTones: Tatooine night's violet is too near done-blue, so the bar is foreground", () => {
  const c = themeColors("tatooine-night");
  assert.equal(hereTones(c, SCENES.tatooine.needs).here, c.foreground);
});

test("hereTones: Mustafar day's accent is too near its needs-you, so the bar is foreground", () => {
  const c = themeColors("mustafar-day");
  assert.equal(hereTones(c, SCENES.mustafar.needs).here, c.foreground);
});

test("hereTones: every scene theme's fill keeps foreground readable", () => {
  const names = readdirSync(new URL("../herdr/themes/", import.meta.url)).filter((f) => /-(day|night)\.json$/.test(f));
  assert.equal(names.length, 24);
  for (const f of names) {
    const scene = f.replace(/-(day|night)\.json$/, "");
    const light = f.includes("-day");
    const c = themeColors(f.replace(".json", ""));
    const { hereFill } = hereTones(c, SCENES[scene].needs);
    assert.ok(contrast(hereFill, c.foreground) >= 4.5, f);
    assert.notEqual(hereFill, c.background, `${f}: the fill should be stronger than the base`);
  }
});

test("hereTones: a theme without accent or selected falls back without throwing", () => {
  const t = hereTones({ foreground: "#e6edf3", raised: "#161b22" }, { dark: "#ec8e2c", light: "#b35900" });
  assert.equal(t.here, "#e6edf3");
  assert.match(t.hereFill, /^#[0-9a-f]{6}$/);
});

test("hereTones: the mode comes from the shown theme's background, not the OS", () => {
  const accent = "#0a6adb";
  assert.ok(deltaESim(accent, DONE.dark) >= 15, "far from the dark blue, so the mode matters");
  const needs = { dark: "#ec8e2c", light: "#b35900" };
  const lightTheme = { foreground: "#1f2328", background: "#ffffff", accent };
  assert.equal(hereTones(lightTheme, needs).here, lightTheme.foreground);
  const darkTheme = { foreground: "#e6edf3", background: "#0d1117", accent };
  assert.equal(hereTones(darkTheme, needs).here, accent);
});

test("hereTones: a done override is what the accent is measured against", () => {
  const c = { foreground: "#e6edf3", background: "#0d1117", accent: "#5fd4d0" };
  const needs = { dark: "#ffd84d", light: "#8a6a00" };
  assert.equal(hereTones(c, needs).here, "#5fd4d0");
  assert.equal(hereTones(c, needs, { dark: "#5fd4d0", light: "#0969da" }).here, c.foreground);
});
