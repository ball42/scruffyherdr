import { test } from "node:test";
import assert from "node:assert/strict";
import { TILL_DONE_CAP_MS, pruneSnooze, snoozeActive, snoozeInfo } from "../herdr/mods/herdr-signals/snooze.js";
import "./support/gpui-stub.js";

const { snoozeLabel, snoozeSet } = await import("../herdr/mods/kit-rail/look.js");

const MIN = 60_000;

test("snoozeActive: a timed snooze lasts until its time", () => {
  assert.equal(snoozeActive(200, 100), true);
  assert.equal(snoozeActive(100, 100), false);
  assert.equal(snoozeActive(undefined, 100), false);
  assert.equal(snoozeActive("junk", 100), false);
});

test("snoozeActive: till done lasts up to the 8-hour cap", () => {
  assert.equal(TILL_DONE_CAP_MS, 8 * 60 * MIN);
  assert.equal(snoozeActive({ done: 100 }, 100 + TILL_DONE_CAP_MS - 1), true);
  assert.equal(snoozeActive({ done: 100 }, 100 + TILL_DONE_CAP_MS), false);
  assert.equal(snoozeActive({ done: "x" }, 100), false);
});

test("pruneSnooze: drops expired timed snoozes and keeps live ones", () => {
  const r = pruneSnooze({ a: 50, b: 500 }, {}, 100);
  assert.deepEqual(r, { snooze: { b: 500 }, changed: true });
  assert.equal(pruneSnooze({ b: 500 }, {}, 100).changed, false);
});

test("pruneSnooze: till done wakes when the Claude finishes after the snooze", () => {
  const att = { a: { kind: "done", since: 150 } };
  assert.deepEqual(pruneSnooze({ a: { done: 100 } }, att, 160).snooze, {});
});

test("pruneSnooze: till done wakes on a new question asked after the snooze", () => {
  const att = { a: { kind: "blocked", since: 150 } };
  assert.deepEqual(pruneSnooze({ a: { done: 100 } }, att, 160).snooze, {});
});

test("pruneSnooze: till done keeps muting what it was already showing", () => {
  const blocked = { a: { kind: "blocked", since: 90 } };
  assert.deepEqual(pruneSnooze({ a: { done: 100 } }, blocked, 160), { snooze: { a: { done: 100 } }, changed: false });
  const done = { a: { kind: "done", since: 90 } };
  assert.equal(pruneSnooze({ a: { done: 100 } }, done, 160).changed, false);
  const working = { a: { kind: null, since: null } };
  assert.equal(pruneSnooze({ a: { done: 100 } }, working, 160).changed, false);
});

test("pruneSnooze: till done ends at the cap", () => {
  assert.deepEqual(pruneSnooze({ a: { done: 100 } }, {}, 100 + TILL_DONE_CAP_MS).snooze, {});
});

test("snoozeInfo: what a model row carries", () => {
  assert.deepEqual(snoozeInfo(500, 100), { snoozed: true, snooze_until: 500, snooze_till_done: false });
  assert.deepEqual(snoozeInfo({ done: 90 }, 100), { snoozed: true, snooze_until: null, snooze_till_done: true });
  assert.deepEqual(snoozeInfo(50, 100), { snoozed: false, snooze_until: null, snooze_till_done: false });
});

test("snoozeSet: each choice, and wake", () => {
  assert.deepEqual(snoozeSet({}, "a", "15m", 0), { a: 15 * MIN });
  assert.deepEqual(snoozeSet({ b: 9 }, "a", "1h", 0), { b: 9, a: 60 * MIN });
  assert.deepEqual(snoozeSet({}, "a", "done", 7), { a: { done: 7 } });
  assert.deepEqual(snoozeSet({ a: { done: 7 }, b: 9 }, "a", null, 0), { b: 9 });
  assert.deepEqual(snoozeSet(null, "a", "15m", 0), { a: 15 * MIN });
});

test("snoozeSet: a new choice replaces the old one", () => {
  assert.deepEqual(snoozeSet({ a: 60 * MIN }, "a", "15m", 0), { a: 15 * MIN });
  assert.deepEqual(snoozeSet({ a: 60 * MIN }, "a", "done", 5), { a: { done: 5 } });
});

test("snoozeLabel: time left rounds up to the minute", () => {
  assert.equal(snoozeLabel({ snoozed: true, snooze_until: 42 * MIN, snooze_till_done: false }, 0), "zz 42m");
  assert.equal(snoozeLabel({ snoozed: true, snooze_until: 30_000, snooze_till_done: false }, 0), "zz 1m");
  assert.equal(snoozeLabel({ snoozed: true, snooze_until: 65 * MIN, snooze_till_done: false }, 0), "zz 1h 5m");
  assert.equal(snoozeLabel({ snoozed: true, snooze_until: 60 * MIN, snooze_till_done: false }, 0), "zz 1h");
  assert.equal(snoozeLabel({ snoozed: true, snooze_until: null, snooze_till_done: true }, 0), "zz till done");
  assert.equal(snoozeLabel({ snoozed: false }, 0), null);
  assert.equal(snoozeLabel(null, 0), null);
});
