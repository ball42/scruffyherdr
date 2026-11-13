import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../herdr/mods/herdr-signals/config.js";

const D = { poll_ms: 1500, readme_tabs: false };

test("readConfig: no config.json (a gallery copy) runs on the defaults, quietly", () => {
  assert.deepEqual(readConfig(null, D), { cfg: D, problem: null });
});

test("readConfig: the file's keys win over the defaults", () => {
  assert.deepEqual(readConfig('{"readme_tabs": true}', D).cfg, { poll_ms: 1500, readme_tabs: true });
});

test("readConfig: junk or a non-object runs on the defaults and says so", () => {
  for (const t of ["{", "[1]", "null", "3"]) {
    const r = readConfig(t, D);
    assert.deepEqual(r.cfg, D);
    assert.match(r.problem, /isn't valid JSON/);
  }
});

test("readConfig: the defaults object is never shared or changed", () => {
  const r = readConfig(null, D);
  r.cfg.poll_ms = 1;
  assert.equal(D.poll_ms, 1500);
});
