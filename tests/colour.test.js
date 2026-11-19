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
