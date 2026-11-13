import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHidIdleSeconds } from "../herdr/mods/herdr-signals/idle.js";

test("parses HIDIdleTime", () => {
  const text = '  |   "HIDIdleTime" = 4500000000\n  |   "HIDSomething" = 1\n';
  assert.equal(parseHidIdleSeconds(text), 4.5);
});

test("missing HIDIdleTime returns null", () => {
  assert.equal(parseHidIdleSeconds("nothing here"), null);
});
