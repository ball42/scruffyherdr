import { test } from "node:test";
import assert from "node:assert/strict";
import { configChanged, readConfig, reloadConfig } from "../herdr/mods/herdr-signals/config.js";

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

test("readConfig keeps alert_colors, and its default is {}", () => {
  const defaults = { alert_colors: {} };
  assert.deepEqual(readConfig('{"alert_colors":{"needs":"#ffd84d"}}', defaults).cfg.alert_colors, { needs: "#ffd84d" });
  assert.deepEqual(readConfig("{}", defaults).cfg.alert_colors, {});
});

test("configChanged is true only when the text changed", () => {
  assert.equal(configChanged(undefined, "{}"), true);
  assert.equal(configChanged("{}", "{}"), false);
  assert.equal(configChanged("{}", '{"a":1}'), true);
  assert.equal(configChanged("{}", null), true);
  assert.equal(configChanged(null, null), false);
});

test("reloadConfig: a reload that can't parse keeps the last good config and names it", () => {
  const good = readConfig('{"addons":["kit-jira"]}', { addons: [] }).cfg;
  const bad = reloadConfig(good, '{"addons": [', { addons: [] });
  assert.deepEqual(bad.cfg, good);
  assert.match(bad.problem, /valid JSON/);
  const gone = reloadConfig(good, null, { addons: [] });
  assert.deepEqual(gone.cfg, good);
  assert.equal(gone.problem, null);
  const fixed = reloadConfig(good, '{"addons":["kit-rail"]}', { addons: [] });
  assert.deepEqual(fixed.cfg.addons, ["kit-rail"]);
  assert.equal(fixed.problem, null);
});

test("reloadConfig: the first read is readConfig's", () => {
  assert.deepEqual(reloadConfig(null, null, { a: 1 }), readConfig(null, { a: 1 }));
  assert.deepEqual(reloadConfig(null, "{", { a: 1 }), readConfig("{", { a: 1 }));
});
