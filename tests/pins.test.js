import { test } from "node:test";
import assert from "node:assert/strict";
import { PIN_GRACE_MS, prunePins } from "../herdr/mods/herdr-signals/pins.js";

test("prunePins: pins on live Claudes stay, nothing changes", () => {
  assert.deepEqual(prunePins(["a", "b"], ["a", "b", "c"], {}, 100), { pins: ["a", "b"], missing: {}, changed: false });
});

test("prunePins: a missing Claude keeps its pin through the grace period", () => {
  let r = prunePins(["a", "b"], ["a"], {}, 100);
  assert.deepEqual(r, { pins: ["a", "b"], missing: { b: 100 }, changed: false });
  r = prunePins(r.pins, ["a"], r.missing, 100 + PIN_GRACE_MS - 1);
  assert.deepEqual(r, { pins: ["a", "b"], missing: { b: 100 }, changed: false });
});

test("prunePins: gone for the whole grace period, the pin goes", () => {
  const r = prunePins(["a", "b"], ["a"], { b: 100 }, 100 + PIN_GRACE_MS);
  assert.deepEqual(r, { pins: ["a"], missing: {}, changed: true });
});

test("prunePins: a Claude that comes back is no longer counted missing", () => {
  assert.deepEqual(prunePins(["b"], ["b"], { b: 100 }, 200), { pins: ["b"], missing: {}, changed: false });
});

test("prunePins: junk pins become an empty list", () => {
  assert.deepEqual(prunePins(null, ["a"], {}, 0), { pins: [], missing: {}, changed: false });
  assert.deepEqual(prunePins("a", ["a"], {}, 0), { pins: [], missing: {}, changed: false });
});

test("prunePins: the grace period is 10 minutes", () => {
  assert.equal(PIN_GRACE_MS, 10 * 60_000);
});
