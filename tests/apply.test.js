import { test } from "node:test";
import assert from "node:assert/strict";
import { APPLY_PROBLEM, applyOutcome, applyPlan, dress, shouldApply } from "../herdr/mods/herdr-signals/dress.js";

const tree = () => ({
  id: "root", type: "row", background: { image: "backgrounds/old.jpg", fit: "cover" },
  children: [
    { id: "rail", type: "block", size: { px: 260 } },
    { id: "main", type: "block", content: { pane: { background: "card" } } },
  ],
});

test("applyPlan: a tree already as wanted needs no layout.set", () => {
  const t = tree();
  assert.equal(applyPlan(t, t), null);
});

test("applyPlan: a tree that differs gets the dressed one", () => {
  const t = tree();
  const want = dress(t, { scene: "endor" });
  assert.deepEqual(applyPlan(t, want), want);
});

test("applyPlan: key order doesn't count as a change", () => {
  const want = dress(tree(), { scene: "endor" });
  const reordered = JSON.parse(JSON.stringify(want));
  reordered.children = reordered.children.map((c) => Object.fromEntries(Object.entries(c).reverse()));
  assert.equal(applyPlan(reordered, want), null);
});

test("applyPlan: dressing the dressed tree again changes nothing", () => {
  const want = dress(tree(), { scene: "endor", light: true, clicks: { rail: { size: { px: 336 } } } });
  assert.equal(applyPlan(want, dress(want, { scene: "endor", light: true })), null);
});

test("applyOutcome: a throw records the key and a problem line", () => {
  const out = applyOutcome("endor|false|endor", new Error("boom"));
  assert.equal(out.failedKey, "endor|false|endor");
  assert.equal(out.problem, `${APPLY_PROBLEM} (boom)`);
});

test("shouldApply: the failed key doesn't retry, a changed key does", () => {
  const failed = applyOutcome("endor|false|endor", "x").failedKey;
  assert.equal(shouldApply(failed, "endor|false|endor"), false);
  assert.equal(shouldApply(failed, "endor|true|endor"), true, "appearance changed");
  assert.equal(shouldApply(failed, "endor-grid|false|endor"), true, "layout changed");
  assert.equal(shouldApply(null, "endor|false|endor"), true);
});

test("applyOutcome: success clears the failure and the problem", () => {
  assert.deepEqual(applyOutcome("k"), { failedKey: null, problem: null });
});

test("applyPlan: Herdr's 32-bit float opacity is not a change", () => {
  const want = dress(tree(), { scene: "endor" });
  const shown = JSON.parse(JSON.stringify(want));
  assert.equal(want.terminal_opacity, 0.45);
  shown.terminal_opacity = 0.44999998807907104;
  assert.equal(applyPlan(shown, want), null);
});

test("applyPlan: a really different opacity still gets the dressed tree", () => {
  const want = dress(tree(), { scene: "endor" });
  const shown = JSON.parse(JSON.stringify(want));
  shown.terminal_opacity = 0.6;
  assert.equal(applyPlan(shown, want), want);
});

test("applyPlan: float noise in a size.px is not a change", () => {
  const want = dress(tree(), { scene: "endor" });
  const shown = JSON.parse(JSON.stringify(want));
  shown.children[0].size.px = 300.0000001;
  want.children[0].size.px = 300;
  assert.equal(applyPlan(shown, want), null);
});

test("a failed key, a clean pass under another key, then the failed key retries", () => {
  // Grid write fails under K1; the next poll's focus pass (K2) writes nothing; the user asks for the grid again.
  const K1 = "scruffy|false|endor|grid|s";
  const K2 = "scruffy|false|endor|focus|";
  let failed = applyOutcome(K1, new Error("boom")).failedKey;
  assert.equal(shouldApply(failed, K1), false, "the same key is skipped: no loop");
  assert.equal(shouldApply(failed, K2), true);
  const clean = applyOutcome(K2);
  assert.deepEqual(clean, { failedKey: null, problem: null }, "a clean pass clears the failure and its line");
  failed = clean.failedKey;
  assert.equal(shouldApply(failed, K1), true, "the retry under K1 runs");
});
