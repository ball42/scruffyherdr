import { test } from "node:test";
import assert from "node:assert/strict";
import { autoSpotlight, awayStep, awayToast } from "../herdr/mods/herdr-signals/model.js";

const arow = (address, since, extra = {}) => ({ address, snoozed: false, attention: { kind: "blocked", since, pulse: true }, ...extra });
const on = { enabled: true, grid: true, idle: 10 };

test("autoSpotlight: picks a newly blocked Claude when idle", () => {
  let r = autoSpotlight({}, [arow("a", 5)], { ...on, enabled: false });
  assert.equal(r.pick, null);
  assert.deepEqual(r.handled, { a: 5 }, "off: no backlog");
  r = autoSpotlight(r.handled, [arow("a", 5), arow("b", 9)], on);
  assert.equal(r.pick, "b");
  assert.equal(autoSpotlight(r.handled, [arow("a", 5), arow("b", 9)], on).pick, null, "once only");
  assert.equal(autoSpotlight(r.handled, [arow("a", 12)], on).pick, "a", "since changed");
});

test("autoSpotlight: waits for idle, skips snoozed/seen, needs the grid", () => {
  const busy = autoSpotlight({}, [arow("a", 5)], { ...on, idle: 1 });
  assert.equal(busy.pick, null);
  assert.equal(autoSpotlight(busy.handled, [arow("a", 5)], on).pick, "a", "still pending after typing stops");
  assert.equal(autoSpotlight({}, [arow("a", 5, { snoozed: true })], on).pick, null);
  assert.equal(autoSpotlight({}, [arow("a", 5, { attention: { kind: "blocked", since: 5, pulse: false } })], on).pick, null);
  assert.equal(autoSpotlight({}, [arow("a", 5)], { ...on, grid: false }).pick, null);
  assert.equal(autoSpotlight({}, [arow("a", 5)], { ...on, idle: null }).pick, null);
});

// --- away
const sn = (a, status, extra = {}) => ({ address: a, name: a.toUpperCase(), status, ...extra });

test("away: summary of what finished or blocked while away", () => {
  let r = awayStep(null, [sn("a", "working"), sn("b", "working"), sn("c", "working"), sn("d", "working")], false);
  r = awayStep(r.track, [sn("a", "working"), sn("b", "working"), sn("c", "working"), sn("d", "working")], true);
  assert.equal(r.report, null);
  r = awayStep(r.track, [sn("a", "done"), sn("b", "done"), sn("c", "blocked"), sn("d", "working", { snoozed: true })], true);
  r = awayStep(r.track, [sn("a", "done"), sn("b", "done"), sn("c", "blocked"), sn("d", "done", { snoozed: true })], false);
  assert.deepEqual(r.report, { done: ["A", "B"], blocked: ["C"] });
  assert.deepEqual(awayToast(r.report), { title: "While you were away", body: "✓ 2 done: A, B · ✋ 1 waiting: C" });
  assert.equal(awayStep(r.track, [sn("a", "done")], false).report, null, "only on the edge");
});

test("away: nothing happened gives no toast; a handled block is not 'waiting'", () => {
  let r = awayStep(null, [sn("a", "working")], false);
  r = awayStep(r.track, [sn("a", "working")], true);
  r = awayStep(r.track, [sn("a", "working")], false);
  assert.equal(awayToast(r.report), null);
  r = awayStep(null, [sn("a", "working")], true);
  r = awayStep(r.track, [sn("a", "blocked")], true);
  r = awayStep(r.track, [sn("a", "working")], false);
  assert.deepEqual(r.report, { done: [], blocked: [] });
  assert.equal(awayToast(null), null);
});
