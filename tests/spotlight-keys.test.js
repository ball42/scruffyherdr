import { test } from "node:test"
import assert from "node:assert/strict";
import { gridSpec, gridLayout, gridLeave, gridSignature, spotNext, gridAddresses } from "../herdr/mods/herdr-signals/grid.js";

const gag = (address, kind = null, extra = {}) => ({
  address, tab: `tab-${address}`, space: "s1", space_name: "P", name: address, hint: null,
  status: kind ?? "working", attention: { kind, since: kind ? 1 : null, pulse: kind === "blocked" }, ...extra,
});
const base = {
  id: "root", type: "row", children: [
    { id: "work-body", type: "row", children: [
      { id: "main", type: "block", size: { fr: 1 }, content: { tab: "active" } },
      { id: "rail", type: "block", content: { mod: "kit-rail" } },
    ] },
  ],
};

test("grid: pinned come first and always get tiles", () => {
  const as = [gag("b", "blocked"), ...Array.from({ length: 10 }, (_, i) => gag(`w${i}`)), gag("p", null, { pinned: true })];
  const s = gridSpec(as, "s1");
  assert.equal(s.tiles[0].address, "p");
  assert.equal(s.tiles[1].address, "b");
  assert.equal(s.tiles.length, 9);
  assert.equal(gridSpec([gag("w0"), gag("p", null, { pinned: true })], "s1").tiles[0].address, "p");
});

test("grid: all spaces tiles every space", () => {
  const as = [gag("a"), gag("b", null, { space: "s2" })];
  assert.deepEqual(gridSpec(as, "s1").tiles.map((x) => x.address), ["a"]);
  const all = gridSpec(as, "s1", [], null, true);
  assert.deepEqual(all.tiles.map((x) => x.address), ["a", "b"]);
  assert.notEqual(gridSignature(all), gridSignature(gridSpec(as, "s1")));
  assert.equal(gridSpec(as, "s1", [], "b", true).spotlight, "b");
  assert.equal(gridSpec(as, "s1", [], "b", false).spotlight, null);
});

test("grid: resized tile and row keep their size across re-tiles", () => {
  const spec = gridSpec([gag("a"), gag("b"), gag("c")], "s1");
  const first = gridLayout(base, spec);
  const rows = first.children[0].children[0].children;
  rows[0].size = { fr: 2 };
  rows[0].children[1].size = { fr: 0.3 };
  const again = gridLayout(first, gridSpec([gag("a"), gag("b"), gag("c"), gag("d")], "s1", ["a", "b", "c"]));
  const r = again.children[0].children[0].children;
  assert.deepEqual(r[0].size, { fr: 2 });
  assert.deepEqual(r[0].children[1].size, { fr: 0.3 });
  assert.equal(r[1].children[0].size, undefined);
  assert.deepEqual(again.children[0].children[0].size, { fr: 1 });
});

test("spotNext wraps both ways and starts at the first", () => {
  const l = ["a", "b", "c"];
  assert.equal(spotNext(l, "a", 1), "b");
  assert.equal(spotNext(l, "c", 1), "a");
  assert.equal(spotNext(l, "a", -1), "c");
  assert.equal(spotNext(l, null, 1), "a");
  assert.equal(spotNext(l, null, -1), "a");
  assert.equal(spotNext([], "a", 1), null);
  assert.equal(spotNext(gridSpec([gag("x"), gag("y")], "s1"), "y", 1), "x");
});

test("gridAddresses: pinned first, scope by all", () => {
  const as = [gag("a"), gag("b", null, { pinned: true }), gag("c", null, { space: "s2" })];
  assert.deepEqual(gridAddresses(as, "s1"), ["b", "a"]);
  assert.deepEqual(gridAddresses(as, "s1", true), ["b", "a", "c"]);
});

test("gridLeave all-spaces: other-space tabs are known, so a space switch is quiet", () => {
  const at = (space, tabs, terminal, all) => ({ space, tabs, terminal, tiles: ["a", "b"], all });
  const first = gridLeave(null, at("s1", ["t1", "t2"], "a", true));
  const sw = gridLeave(first.state, at("s2", ["t1", "t2"], "b", true));
  assert.equal(sw.leave, false);
  assert.equal(gridLeave(sw.state, at("s2", ["t1", "t2", "t3"], "b", true)).leave, true, "new tab");
  assert.equal(gridLeave(sw.state, at("s2", ["t1", "t2"], "shell", true)).leave, true, "untiled terminal");
  // flipping the mode changes the tab set but only records
  assert.equal(gridLeave(first.state, at("s1", ["t1"], "a", false)).leave, false);
  // single-space mode still leaves on a new tab
  const one = gridLeave(null, at("s1", ["t1"], "a", false));
  assert.equal(gridLeave(one.state, at("s1", ["t1", "t2"], "a", false)).leave, true);
});

