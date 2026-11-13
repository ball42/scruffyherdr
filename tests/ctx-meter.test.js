import { test } from "node:test";
import assert from "node:assert/strict";
import "./support/gpui-stub.js";

const { ctxMeter } = await import("../herdr/mods/kit-rail/look.js");

test("ctxMeter: no data, no meter", () => {
  assert.equal(ctxMeter(null), null);
  assert.equal(ctxMeter(undefined), null);
  assert.equal(ctxMeter("40"), null);
  assert.equal(ctxMeter(Number.NaN), null);
});

test("ctxMeter: plenty left is calm, with no figure", () => {
  assert.deepEqual(ctxMeter(60), { used: 40, tone: "calm", figure: null });
  assert.deepEqual(ctxMeter(31), { used: 69, tone: "calm", figure: null });
});

test("ctxMeter: 30% left or less is low and shows the figure", () => {
  assert.deepEqual(ctxMeter(30), { used: 70, tone: "low", figure: "30%" });
  assert.deepEqual(ctxMeter(16), { used: 84, tone: "low", figure: "16%" });
});

test("ctxMeter: 15% left or less is critical", () => {
  assert.deepEqual(ctxMeter(15), { used: 85, tone: "critical", figure: "15%" });
  assert.deepEqual(ctxMeter(0), { used: 100, tone: "critical", figure: "0%" });
});

test("ctxMeter: clamps out-of-range values", () => {
  assert.deepEqual(ctxMeter(-5), { used: 100, tone: "critical", figure: "0%" });
  assert.deepEqual(ctxMeter(140), { used: 0, tone: "calm", figure: null });
});

const { ctxEdge, ctxFigure } = await import("../herdr/mods/kit-rail/look.js");
const T = { muted: "#8b949e", foreground: "#c9d1d9" };
const kids = (el) => el.calls.filter((c) => c[0] === "child").map((c) => c[1]);
const call = (el, name) => el.calls.find((c) => c[0] === name)?.slice(1);

test("ctxEdge: grey fill while calm, foreground once low, width = used", () => {
  assert.equal(ctxEdge(null, T), null);
  const [, calmFill] = kids(ctxEdge(ctxMeter(60), T));
  assert.deepEqual([call(calmFill, "w")[0], call(calmFill, "bg")[0]], ["40%", T.muted]);
  const [, lowFill] = kids(ctxEdge(ctxMeter(20), T));
  assert.deepEqual([call(lowFill, "w")[0], call(lowFill, "bg")[0]], ["80%", T.foreground]);
});

test("ctxEdge: nothing used draws only the track", () => {
  assert.equal(kids(ctxEdge(ctxMeter(100), T)).length, 1);
});

test("ctxFigure: only once low, bold when critical", () => {
  assert.equal(ctxFigure(ctxMeter(60), T), null);
  assert.equal(call(ctxFigure(ctxMeter(25), T), "font_bold"), undefined);
  assert.deepEqual(call(ctxFigure(ctxMeter(10), T), "child"), ["10%"]);
  assert.notEqual(call(ctxFigure(ctxMeter(10), T), "font_bold"), undefined);
});
