import { test } from "node:test";
import assert from "node:assert/strict";
import "./support/gpui-stub.js";

const { ARROW_MODES, alertArrows, arrowAction, flaring, switchVia } = await import("../herdr/mods/kit-rail/arrow.js");

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

const { arrowButton } = await import("../herdr/mods/kit-rail/arrow.js");
const T = { foreground: "#e6edf3", muted: "#8b949e", hover: "#222222", chrome: "#161b22", border: "#30363d" };
/** Every [name, ...args] call in an element and its children. */
const calls = (e) => e.calls.flatMap((c) => [c, ...(c[0] === "child" && c[1]?.calls ? calls(c[1]) : [])]);
const texts = (e) => calls(e).filter((c) => c[0] === "child" && typeof c[1] === "string").map((c) => c[1]).join(" ");

test("arrowButton: a named button with the direction, ✋, the name and +N", () => {
  let clicked = 0;
  const b = arrowButton({ dir: "up", target: { address: "a", name: "claude · beta", more: 1 }, lit: true, t: T, onClick: () => clicked++ });
  assert.ok(calls(b).some((c) => c[0] === "id" && c[1] === "alert-arrow-up"));
  const words = texts(b);
  for (const w of ["▲", "✋", "claude · beta", "+1"]) assert.ok(words.includes(w), `${w} in ${words}`);
  assert.ok(calls(b).some((c) => c[0] === "tooltip" && c[1] === "Needs you: claude · beta"));
  const click = calls(b).find((c) => c[0] === "on_click");
  click[1]({}, {});
  assert.equal(clicked, 1);
  assert.equal(calls(b).find((c) => c[0] === "opacity")[1], 0.7);
});

test("arrowButton: unlit, no +N for one, and each direction's glyph", () => {
  const b = arrowButton({ dir: "right", target: { address: "a", name: "x", more: 0 }, lit: false, t: T, onClick: () => {} });
  assert.equal(calls(b).find((c) => c[0] === "opacity")[1], 0);
  assert.ok(!texts(b).includes("+"));
  for (const [dir, g] of [["down", "▼"], ["left", "◀"], ["right", "▶"]]) {
    assert.ok(texts(arrowButton({ dir, target: { address: "a", name: "x", more: 0 }, lit: false, t: T, onClick: () => {} })).includes(g));
  }
});

test("ARROW_MODES is herdr-signals' list (two copies: mods import only their own folder)", async () => {
  const signals = await import("../herdr/mods/herdr-signals/config.js");
  assert.deepEqual(ARROW_MODES, signals.ARROW_MODES);
});

test("alertArrows: each side points at the Claude that blocked last (the one behind the sound)", () => {
  const at = (address, since) => ({ ...ag(address, true), attention: { kind: "blocked", pulse: true, since } });
  const agents = [at("old", 1_000), at("new", 9_000), ag("here"), at("b1", 5_000), at("b2", 8_000)];
  const got = alertArrows(agents, "here");
  assert.deepEqual(got.before, { address: "new", name: "new", more: 1 });
  assert.deepEqual(got.after, { address: "b2", name: "b2", more: 1 });
});

test("switchVia: the grid swaps the spotlight like a card click; elsewhere focus the Claude", () => {
  assert.equal(switchVia("grid"), "card");
  assert.equal(switchVia("focus"), "focus");
  assert.equal(switchVia(undefined), "focus");
});

test("alertArrows: Claudes kept off the list still place the arrows, but are never targets", () => {
  // The strip: the spotlight is focused but has no card in the row.
  const row = [ag("spot", true), ag("b", true), ag("c")];
  const pick = alertArrows(row, "spot", ["spot"]);
  assert.equal(pick.before, null, "nothing sits before the spotlight's slot");
  assert.equal(pick.after.address, "b", "b, right of the spotlight, is after");
  const mid = alertArrows([ag("a", true), ag("spot", true), ag("c", true)], "c", ["spot"]);
  assert.equal(mid.before.address, "a", "the kept-off spotlight is never a target");
  assert.equal(mid.before.more, 0);
});

test("arrowButton: the name caps its width; the arrow is a named Tab stop with a ring", () => {
  const b = arrowButton({ dir: "down", target: { address: "a", name: "a very long name indeed", more: 0 }, lit: false, t: T, onClick: () => {} });
  assert.ok(calls(b).some((c) => c[0] === "max_w" && c[1] === 140));
  assert.ok(calls(b).some((c) => c[0] === "tab_index" && c[1] === 0));
  assert.ok(calls(b).some((c) => c[0] === "role" && c[1] === "button"));
  assert.ok(calls(b).some((c) => c[0] === "accessibility_label" && c[1] === "Needs you: a very long name indeed"));
  assert.ok(calls(b).some((c) => c[0] === "focus"));
});
