import { test } from "node:test";
import assert from "node:assert/strict";
import { readSizes, seedAside, sizesRecord, sizesText } from "../herdr/mods/herdr-signals/sizes.js";

const focusTree = { id: "root", children: [{ id: "sidebar", size: { px: 200 } }, { id: "rail", size: { px: 333 } }, { id: "main" }] };
const gridTree = { id: "root", children: [{ id: "sidebar", size: { px: 200 } }, { id: "kit-grid" }, { id: "rail", size: { px: 400 } }] };

test("readSizes never throws and keeps only id -> object entries", () => {
  assert.deepEqual(readSizes(null), { focus: {}, grid: {} });
  assert.deepEqual(readSizes("{"), { focus: {}, grid: {} });
  assert.deepEqual(readSizes('{"focus":[1],"grid":"x"}'), { focus: {}, grid: {} });
  assert.deepEqual(readSizes('{"focus":{"rail":{"size":{"px":1}},"bad":3}}'), { focus: { rail: { size: { px: 1 } } }, grid: {} });
});

test("sizesRecord: the written view takes the tree's sizes, the other keeps its own plus what is aside", () => {
  const prev = { focus: { rail: { size: { px: 300 } }, panel: { size: { px: 368 } } }, grid: {} };
  const rec = sizesRecord(prev, "grid", gridTree, { focus: { rail: { size: { px: 333 } } }, grid: {} });
  assert.deepEqual(rec.grid, { sidebar: { size: { px: 200 } }, rail: { size: { px: 400 } } });
  assert.deepEqual(rec.focus, { rail: { size: { px: 333 } }, panel: { size: { px: 368 } } });
  const back = sizesRecord(rec, "focus", focusTree, { focus: {}, grid: { rail: { size: { px: 400 } } } });
  assert.deepEqual(back.focus.rail, { size: { px: 333 } });
  assert.deepEqual(back.grid.rail, { size: { px: 400 } });
  assert.deepEqual(sizesRecord(null, "focus", focusTree).grid, {});
});

test("sizesText is stable for the same record, and reads back", () => {
  const rec = sizesRecord({}, "focus", focusTree);
  assert.equal(sizesText(rec), sizesText(JSON.parse(JSON.stringify(rec))));
  assert.deepEqual(readSizes(sizesText(rec)), { focus: rec.focus, grid: {} });
  assert.equal(sizesText(null), '{\n  "focus": {},\n  "grid": {}\n}\n');
});

test("seedAside puts the saved record beneath what herdr-signals already holds", () => {
  const out = seedAside({ focus: { rail: { size: { px: 1 } } }, grid: {} }, { focus: { rail: { size: { px: 2 } }, panel: { size: { px: 3 } } }, grid: { rail: { size: { px: 4 } } } });
  assert.deepEqual(out, { focus: { rail: { size: { px: 1 } }, panel: { size: { px: 3 } } }, grid: { rail: { size: { px: 4 } } } });
  assert.deepEqual(seedAside(null, null), { focus: {}, grid: {} });
});

import { replaySizes } from "../herdr/mods/herdr-signals/sizes.js";

test("replaySizes lays writes made before the load over the loaded record, keeping the other view", () => {
  const loaded = { focus: { rail: { size: { px: 333 } } }, grid: { rail: { size: { px: 400 } }, sidebar: { size: { px: 190 } } } };
  const out = replaySizes(loaded, [{ view: "focus", tree: focusTree, aside: { focus: {}, grid: {} } }]);
  assert.deepEqual(out.grid, loaded.grid, "the grid entry on disk survives an early focus write");
  assert.deepEqual(out.focus, { sidebar: { size: { px: 200 } }, rail: { size: { px: 333 } } });
  const two = replaySizes(loaded, [
    { view: "focus", tree: focusTree, aside: null },
    { view: "grid", tree: gridTree, aside: { focus: { panel: { size: { px: 368 } } }, grid: {} } },
  ]);
  assert.deepEqual(two.grid, { sidebar: { size: { px: 200 } }, rail: { size: { px: 400 } } });
  assert.deepEqual(two.focus.panel, { size: { px: 368 } });
  assert.deepEqual(replaySizes(loaded, []), loaded);
  assert.deepEqual(replaySizes(readSizes(null), null), { focus: {}, grid: {} });
});
