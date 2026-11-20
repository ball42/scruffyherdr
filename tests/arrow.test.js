import { test } from "node:test";
import assert from "node:assert/strict";
import "./support/gpui-stub.js";

const { ARROW_MODES, alertArrows, arrowAction, flaring } = await import("../herdr/mods/kit-rail/arrow.js");

const ag = (address, blocked = false, pulse = true, snoozed = false, space = "s1") =>
  ({ address, name: address, space, attention: { kind: blocked ? "blocked" : "idle", pulse }, snoozed });

test("flaring: blocked, unseen and not snoozed", () => {
  assert.equal(flaring(ag("a", true)), true);
  assert.equal(flaring(ag("a", true, false)), false);
  assert.equal(flaring(ag("a", true, true, true)), false);
  assert.equal(flaring({ ...ag("a"), attention: { kind: "done", pulse: true } }), false);
});

test("alertArrows: the nearest flaring Claude each way, with how many more", () => {
  const agents = [ag("a"), ag("b", true), ag("c"), ag("here"), ag("d"), ag("e", true), ag("f", true)];
  assert.deepEqual(alertArrows(agents, "here"), {
    before: { address: "b", name: "b", more: 0 },
    after: { address: "e", name: "e", more: 1 },
  });
});

test("alertArrows: nothing flaring gives no arrows", () => {
  const agents = [ag("a", true, false), ag("here"), ag("b", true, true, true), { ...ag("c"), attention: { kind: "done", pulse: true } }];
  assert.deepEqual(alertArrows(agents, "here"), { before: null, after: null });
});

test("alertArrows: the Claude you're in never points at itself", () => {
  assert.deepEqual(alertArrows([ag("x"), ag("here", true)], "here"), { before: null, after: null });
});

test("alertArrows: in no Claude, every flaring one is before, nearest first", () => {
  const agents = [ag("p", true), ag("q"), ag("r", true)];
  const want = { before: { address: "p", name: "p", more: 1 }, after: null };
  assert.deepEqual(alertArrows(agents, "elsewhere"), want);
  assert.deepEqual(alertArrows(agents, null), want);
});

test("alertArrows: a flaring Claude in an earlier space is before", () => {
  const agents = [ag("o", true, true, false, "s0"), ag("here", false, true, false, "s1")];
  assert.equal(alertArrows(agents, "here").before.address, "o");
});

test("arrowAction: each mode, an unknown one, and a row that's gone", () => {
  assert.deepEqual(arrowAction("scroll-switch", 4), { scroll: 4, flash: true, switch: true });
  assert.deepEqual(arrowAction("scroll", 4), { scroll: 4, flash: true, switch: false });
  assert.deepEqual(arrowAction("switch", 4), { scroll: null, flash: false, switch: true });
  assert.deepEqual(arrowAction("bogus", 2), { scroll: 2, flash: true, switch: true });
  assert.deepEqual(arrowAction(undefined, 2), { scroll: 2, flash: true, switch: true });
  assert.deepEqual(arrowAction("scroll", -1), { scroll: null, flash: false, switch: false });
  assert.deepEqual(ARROW_MODES, ["scroll-switch", "scroll", "switch"]);
});
