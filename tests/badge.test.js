// The Dock badge (config dock_badge): badge.js's pure step, and herdr-signals
// setting it under a stubbed Herdr only when the blocked count changes.
import { host, fakeCx } from "./support/herdr-stub.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { badgeStep, dockBadge } = await import("../herdr/mods/herdr-signals/badge.js");
const { default: Signals } = await import("../herdr/mods/herdr-signals/main.js");
const { dress } = await import("../herdr/mods/herdr-signals/dress.js");
const { setActiveScenes } = await import("../herdr/mods/herdr-signals/scenes.js");

test("dockBadge: the blocked count while on, else null", () => {
  assert.equal(dockBadge(true, 3), "3");
  assert.equal(dockBadge(true, 0), null);
  assert.equal(dockBadge(false, 3), null);
  assert.equal(dockBadge(undefined, 3), null, "unset is off");
  assert.equal(dockBadge("yes", 3), null, "only true turns it on");
  assert.equal(dockBadge(true, NaN), null);
});

test("badgeStep: calls only on a change; the first step always calls, so off clears once", () => {
  assert.deepEqual(badgeStep(undefined, false, 2), { text: null, call: true });
  assert.deepEqual(badgeStep(null, false, 2), { text: null, call: false });
  assert.deepEqual(badgeStep(null, true, 2), { text: "2", call: true });
  assert.deepEqual(badgeStep("2", true, 2), { text: "2", call: false });
  assert.deepEqual(badgeStep("2", true, 1), { text: "1", call: true });
  assert.deepEqual(badgeStep("1", true, 0), { text: null, call: true });
  assert.deepEqual(badgeStep("1", false, 1), { text: null, call: true }, "turned off clears it");
});

// herdr-signals under the stub.
const realNow = Date.now;
Date.now = () => host.now;
test.after(() => { Date.now = realNow; });

const CONFIG = "/home/test/.config/herdr-kit/config.json";
const BASE_TREE = () => ({
  id: "root", type: "row", children: [
    { id: "sidebar", type: "block", size: { px: 220 } },
    { id: "main", type: "block", size: { weight: 1 }, content: { tab: "active", pane: {} } },
    { id: "strip", type: "block", size: { px: 30 }, content: { mod: "herdr-signals", props: {} } },
  ],
});
const agent = (address, status) => ({ address, status, focused: false, tab: `tab-${address}`, tab_name: address, space: "s1", space_name: "s1", pane: `p-${address}` });
const quiet = async (cx, ms) => {
  const log = console.log;
  console.log = () => {};
  try { await cx.advance(ms); } finally { console.log = log; }
};

async function start(config, { checking = false } = {}) {
  setActiveScenes(null);
  const tree = dress(BASE_TREE(), { scene: "naboo" });
  Object.assign(host, { shared: { layout: "scruffy" }, sets: [], runs: [], badges: [], checking, agents: [], layout: tree, layouts: ["scruffy"], props: {} });
  host.themeJson = readFileSync(new URL("../herdr/themes/naboo-night.json", import.meta.url), "utf8");
  host.files = { [CONFIG]: JSON.stringify(config), "/app/layouts/scruffy.json": JSON.stringify(tree) };
  const cx = fakeCx();
  cx.settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };
  const view = new Signals();
  const log = console.log;
  console.log = () => {};
  try { view.init({}, cx); await cx.settle(); } finally { console.log = log; }
  return cx;
}

test("dock_badge on: the blocked count goes on the badge once per change, and null at zero", async () => {
  const cx = await start({ dock_badge: true });
  host.agents = [agent("a", "blocked"), agent("b", "working")];
  await quiet(cx, 11_000);
  assert.deepEqual(host.badges, ["1"], "set once, not every poll");
  host.agents = [agent("a", "blocked"), agent("b", "blocked")];
  await quiet(cx, 6_000);
  assert.deepEqual(host.badges, ["1", "2"]);
  host.agents = [agent("a", "working"), agent("b", "done")];
  await quiet(cx, 6_000);
  assert.deepEqual(host.badges, ["1", "2", null], "zero clears it");
  setActiveScenes(null);
});

test("dock_badge off: cleared once at start, never set; turned off later clears it once", async () => {
  const cx = await start({});
  host.agents = [agent("a", "blocked")];
  await quiet(cx, 11_000);
  assert.deepEqual(host.badges, [null], "one clear, no count");
  host.files[CONFIG] = JSON.stringify({ dock_badge: true });
  await quiet(cx, 15_000);
  assert.deepEqual(host.badges, [null, "1"]);
  host.files[CONFIG] = JSON.stringify({ dock_badge: false });
  await quiet(cx, 15_000);
  assert.deepEqual(host.badges, [null, "1", null]);
  setActiveScenes(null);
});

test("under checking() herdr-signals never calls setBadge", async () => {
  const cx = await start({ dock_badge: true }, { checking: true });
  host.agents = [agent("a", "blocked")];
  await quiet(cx, 11_000);
  assert.deepEqual(host.badges, []);
  setActiveScenes(null);
});
