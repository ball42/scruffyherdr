import { test } from "node:test";
import assert from "node:assert/strict";
import { METRICS, buttonTexts, leftPx, signalsWidth, stripFit, usagePx } from "../herdr/mods/herdr-signals/strip-fit.js";

const usage = { five: { text: "5h 14%", used: 14 }, week: { text: "wk 50%" }, out: "⚠ out ~3:40p" };

test("strip fit: a wide strip keeps every word", () => {
  assert.equal(stripFit(1600, leftPx(["✋ 2 NEEDS YOU · 14m", "✓ 1 DONE"], usagePx(usage)), "Small Moon", false), "full");
});

test("strip fit: tighter first drops the scene's name, then every word", () => {
  const left = leftPx(["✋ 2 NEEDS YOU · 14m", "☀☀ 3 asks", "✓ 1 DONE"], usagePx(usage));
  const full = stripFit(2000, left, "Small Moon", false);
  assert.equal(full, "full");
  let level = "full";
  const seen = [];
  for (let w = 2000; w > 0; w -= 20) {
    const l = stripFit(w, left, "Small Moon", false);
    if (l !== level) { seen.push(l); level = l; }
  }
  assert.deepEqual(seen, ["short", "icons"]);
});

test("strip fit: icons are the floor, and an unknown width is short", () => {
  assert.equal(stripFit(50, 5000, "Hoth", true), "icons");
  assert.equal(stripFit(null, 0, "Hoth", true), "short");
  assert.equal(stripFit(NaN, 0, "Hoth", true), "short");
  assert.equal(stripFit(-3, 0, "Hoth", true), "short");
});

test("strip fit: the buttons' texts per level", () => {
  assert.deepEqual(buttonTexts("full", "Hoth", false), { focus: "◎ focus", addons: [], scene: "◐ Hoth", view: "▦ grid" });
  assert.equal(buttonTexts("short", "Hoth", true).scene, "◐");
  assert.equal(buttonTexts("short", "Hoth", true).view, "▣ focus");
  assert.deepEqual(buttonTexts("icons", "Hoth", true), { focus: "◎", addons: [], scene: "◐", view: "▣" });
  assert.equal(buttonTexts("full", null, false).scene, "◐");
});

test("strip fit: add-on buttons show glyph and label, the glyph alone at icons, and take room", () => {
  const day = { id: "day", glyph: "◷", label: "day", tip: "Day view" };
  assert.deepEqual(buttonTexts("full", "Hoth", false, null, [day]).addons, ["◷ day"]);
  assert.deepEqual(buttonTexts("short", "Hoth", false, null, [day]).addons, ["◷ day"]);
  assert.deepEqual(buttonTexts("icons", "Hoth", false, null, [day]).addons, ["◷"]);
  // The widest width where the add-on button doesn't fit in full, but would without it.
  let w = 2000;
  while (stripFit(w, 0, "Hoth", false, [day]) === "full") w -= 1;
  assert.equal(stripFit(w, 0, "Hoth", false), "full");
});

test("strip fit: usagePx copes with no meter and a reset window", () => {
  assert.equal(usagePx(null), 0);
  assert.ok(usagePx({ five: { text: "5h —", used: null }, week: null, out: null }) > 0);
});

const tree = (size) => ({ id: "root", type: "column", children: [{ id: "body", type: "row", children: [{ id: "signals", type: "block", ...(size ? { size } : {}) }] }] });

test("signalsWidth: the signals node's px, else 300", () => {
  assert.equal(signalsWidth(tree({ px: 300 })), 300);
  assert.equal(signalsWidth(tree({ px: 420 })), 420);
  assert.equal(signalsWidth(tree({ weight: 2 })), 300);
  assert.equal(signalsWidth(tree(null)), 300);
  assert.equal(signalsWidth(tree({ px: -5 })), 300);
  assert.equal(signalsWidth({ id: "root" }), 300);
  assert.equal(signalsWidth(null), 300);
});

test("strip fit: at 300px with counts and the usage meter showing it is compact, never full", () => {
  const left = leftPx(["✋ 2 NEEDS YOU · 14m", "✓ 1 DONE"], usagePx(usage));
  assert.notEqual(stripFit(signalsWidth(tree({ px: 300 })), left, "Small Moon", false), "full");
  // Even a lone count and no meter leaves no room for every word at 300px.
  assert.notEqual(stripFit(300, leftPx(["✋ 1 NEEDS YOU"]), "Small Moon", false), "full");
});

test("strip fit: the metrics are one object that retunes the estimate", () => {
  const before = stripFit(800, 0, "Hoth", false);
  const old = METRICS.CHAR_PX;
  METRICS.CHAR_PX = 40;
  try { assert.notEqual(stripFit(800, 0, "Hoth", false), before === "icons" ? "x" : before); } finally { METRICS.CHAR_PX = old; }
});

import { SCENES_DIALOG, leftTexts } from "../herdr/mods/herdr-signals/strip-fit.js";
import { dialogSize } from "../herdr/mods/kit-scenes/picker.js";

test("leftTexts: 'all quiet' counts when nothing else shows", () => {
  assert.deepEqual(leftTexts({}), ["all quiet"]);
  assert.deepEqual(leftTexts({ counts: [null, "✓ 1 DONE"] }), ["✓ 1 DONE"]);
  assert.deepEqual(leftTexts({ note: "n" }), ["all quiet", "n"]);
  assert.deepEqual(leftTexts({ problem: "p", digest: "d" }), ["p", "d"]);
});

test("strip fit: at 300px with only 'all quiet' and no meter it is icons", () => {
  assert.equal(stripFit(300, leftPx(leftTexts({})), "Small Moon", false), "icons");
});

test("the dialog size herdr-signals opens equals the picker's content size", () => {
  assert.deepEqual(SCENES_DIALOG, dialogSize());
  assert.deepEqual(dialogSize(), { width: 1024, height: 412 });
});

test("buttonTexts: a pinned look shows on the scene button as ☀ or ☾", () => {
  assert.equal(buttonTexts("full", "Hoth", false, "day").scene, "☀ Hoth");
  assert.equal(buttonTexts("short", "Hoth", false, "night").scene, "☾");
  assert.equal(buttonTexts("icons", "Hoth", false, "day").scene, "☀");
  assert.equal(buttonTexts("full", "Hoth", false, null).scene, "◐ Hoth", "following the appearance");
});
