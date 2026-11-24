import { test } from "node:test";
import assert from "node:assert/strict";
import { isSignalsId, signalsId } from "../herdr/mods/herdr-signals/strip-id.js";
import { signalsWidth } from "../herdr/mods/herdr-signals/strip-fit.js";
import { withAddons } from "../herdr/mods/herdr-signals/addons.js";
import { KIT_LAYOUT } from "../herdr/mods/herdr-signals/scenes.js";

test("the kit layout keeps the plain id; any other kit layout gets its own", () => {
  assert.equal(signalsId(KIT_LAYOUT), "signals");
  assert.equal(signalsId("lab"), "signals-lab");
  assert.notEqual(signalsId("lab"), signalsId(KIT_LAYOUT));
  assert.equal(signalsId(null), "signals");
  assert.equal(signalsId(""), "signals");
});

test("isSignalsId knows every layout's strip and nothing else", () => {
  assert.ok(isSignalsId("signals"));
  assert.ok(isSignalsId("signals-lab"));
  assert.ok(!isSignalsId("signalsx"));
  assert.ok(!isSignalsId("status-bar"));
  assert.ok(!isSignalsId(undefined));
});

const tree = (id) => ({ id: "root", type: "row", children: [{ id: "status", type: "row", children: [
  { id: "status-bar", type: "block" },
  { id, type: "block", size: { px: 420 }, content: { mod: "herdr-signals" } },
] }] });

test("the strip width and the add-on blocks find a renamed strip", () => {
  assert.equal(signalsWidth(tree("signals-lab")), 420);
  const out = withAddons(tree("signals-lab"), [{ id: "addon-x", type: "block", size: { px: 0 } }]);
  assert.deepEqual(out.children[0].children.map((c) => c.id), ["status-bar", "signals-lab", "addon-x"]);
});
