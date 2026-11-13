import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeCx } from "./support/gpui-stub.js";

const { AGAIN_ARMED_FOR, RUN_SETTLE_FOR, RunGate, confirmRun, pressRun, ranClean } = await import("../herdr/mods/kit-rail/look.js");

const done0 = { state: "done", exit: 0 };

// 2026-11-09: "merge the deferred-minors PR" had already merged. Real
// trackpad clicks at 20:02:44.7, 20:03:03.4 and 20:03:18.5 each landed on its
// ▶ button and each started a run. Before the gate a press always ran.
test("RunGate: stray presses on a card that ran clean only arm it", () => {
  const cx = fakeCx();
  const gate = new RunGate();
  let runs = 0;
  const start = () => runs++;
  assert.equal(pressRun(gate, "t87-1h1yhyz", false, start, cx, 0), "run");
  assert.equal(runs, 1);
  // The run finished with exit 0; the button now says ▶ Again.
  assert.equal(pressRun(gate, "t87-1h1yhyz", true, start, cx, 18_700), "armed");
  assert.equal(pressRun(gate, "t87-1h1yhyz", true, start, cx, 33_800), "armed");
  assert.equal(runs, 1, "no click on ▶ Again runs a card that already worked");
});

test("RunGate: ▶ Run again runs once, only while armed", () => {
  const gate = new RunGate();
  assert.equal(gate.press("k", true, 1000), "armed");
  assert.equal(gate.armed("k", 1000 + AGAIN_ARMED_FOR - 1), true);
  assert.equal(gate.confirm("k", 2000), "run");
  assert.equal(gate.armed("k", 2000), false);
  assert.equal(gate.confirm("k", 2100), "expired", "a second confirm doesn't run it again");
  gate.press("k", true, 10_000);
  assert.equal(gate.confirm("k", 10_000 + AGAIN_ARMED_FOR), "expired", "an arm runs out");
});

test("RunGate: cancel disarms; arming one card disarms the other", () => {
  const gate = new RunGate();
  gate.press("a", true, 0);
  gate.cancel("a");
  assert.equal(gate.confirm("a", 10), "expired");
  gate.press("a", true, 100);
  gate.press("b", true, 200);
  assert.equal(gate.armed("a", 200), false);
  assert.equal(gate.armed("b", 200), true);
});

test("RunGate: a second press while the run starts is dropped (double click)", () => {
  const gate = new RunGate();
  assert.equal(gate.press("k", false, 0), "run");
  assert.equal(gate.press("k", false, 250), "busy");
  assert.equal(gate.press("other", false, 250), "run", "other cards aren't held up");
  assert.equal(gate.press("k", false, RUN_SETTLE_FOR), "run", "a failed card can run again once it settles");
  assert.equal(gate.confirm("k", RUN_SETTLE_FOR + 1), "expired");
});

test("RunGate: a card that failed or never ran still runs on one click", () => {
  const gate = new RunGate();
  assert.equal(gate.press("never", false, 0), "run");
  assert.equal(gate.press("failed", ranClean([{ state: { state: "done", exit: 1 } }]), 0), "run");
});

test("pressRun and confirmRun: redraw, and redraw again when the arm runs out", () => {
  const cx = fakeCx();
  const gate = new RunGate();
  let runs = 0;
  pressRun(gate, "k", true, () => runs++, cx, 0);
  assert.equal(cx.notifies, 1);
  assert.equal(cx.live(), 1);
  cx.advance(AGAIN_ARMED_FOR);
  assert.equal(cx.notifies, 2);
  assert.equal(confirmRun(gate, "k", () => runs++, cx, 5), "run");
  assert.equal(runs, 1);
  assert.equal(confirmRun(gate, "k", () => runs++, cx, 6), "expired");
  assert.equal(runs, 1);
});

test("ranClean: every card done with exit 0", () => {
  assert.equal(ranClean([{ state: done0 }, { state: done0 }]), true);
  assert.equal(ranClean([{ state: done0 }, { state: { state: "skipped", exit: null } }]), false);
  assert.equal(ranClean([{ state: null }]), false);
  assert.equal(ranClean([]), false);
  assert.equal(ranClean(null), false);
});
