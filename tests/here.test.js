import { test } from "node:test";
import assert from "node:assert/strict";
import "./support/gpui-stub.js";

const { hereBar, hereFill, scrollStep } = await import("../herdr/mods/kit-rail/here.js");

test("scrollStep: no scroll on the first render", () => {
  assert.deepEqual(scrollStep(undefined, "t1", 3), { index: null, prev: "t1" });
});

test("scrollStep: a focus change scrolls to the new Claude's row", () => {
  assert.deepEqual(scrollStep("t1", "t2", 5), { index: 5, prev: "t2" });
});

test("scrollStep: a reorder with focus unchanged doesn't scroll", () => {
  assert.deepEqual(scrollStep("t2", "t2", 7), { index: null, prev: "t2" });
});

test("scrollStep: focus on a terminal that isn't a Claude doesn't scroll, and stays pending", () => {
  assert.deepEqual(scrollStep("t2", "sh", -1), { index: null, prev: "t2" });
});

test("scrollStep: a new Claude focused before its card exists is scrolled to when the card appears", () => {
  let s = scrollStep("t1", "t9", -1);
  assert.equal(s.index, null);
  s = scrollStep(s.prev, "t9", 6);
  assert.deepEqual(s, { index: 6, prev: "t9" });
  assert.equal(scrollStep(s.prev, "t9", 6).index, null, "only once");
});

test("scrollStep: back to a Claude, even at row 0, scrolls", () => {
  assert.deepEqual(scrollStep("sh", "t2", 0), { index: 0, prev: "t2" });
});

test("scrollStep: focus lost (null) doesn't scroll", () => {
  assert.deepEqual(scrollStep("t2", null, -1), { index: null, prev: null });
  assert.equal(scrollStep(null, "t2", 3).index, 3, "focus coming back scrolls");
});

test("hereBar: a 3-px bar in kit.here's colour, else foreground", () => {
  const calls = hereBar({ here: "#5fd4d0" }, { foreground: "#ffffff" }).calls;
  assert.ok(calls.some((c) => c[0] === "w" && c[1] === 3));
  assert.ok(calls.some((c) => c[0] === "bg" && c[1] === "#5fd4d0"));
  assert.ok(calls.some((c) => c[0] === "absolute"));
  assert.ok(hereBar(null, { foreground: "#fff" }).calls.some((c) => c[0] === "bg" && c[1] === "#fff"));
});

test("hereFill: kit.here's fill, else the theme's selected", () => {
  assert.equal(hereFill({ hereFill: "#1d2a33" }, { selected: "#222" }), "#1d2a33");
  assert.equal(hereFill(null, { selected: "#222" }), "#222");
});
