import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENES, sceneList } from "../herdr/mods/herdr-signals/scenes.js";
import { COLS, pickerStart, pickerStep, tileInputs, dialogSize, gridHeight, TILE } from "../herdr/mods/kit-scenes/picker.js";

const keys = Object.keys(SCENES);
const at = (index, extra = {}) => ({ index, day: false, count: 10, cols: 5, ...extra });

test("picker: ten scenes in a 5 by 2 grid", () => {
  assert.equal(keys.length, 10);
  assert.equal(COLS, 5);
});

test("picker: right from the end of a row stays put", () => {
  assert.equal(pickerStep(at(4), "right", keys).state.index, 4);
  assert.equal(pickerStep(at(0), "left", keys).state.index, 0);
  assert.equal(pickerStep(at(5), "left", keys).state.index, 5);
  assert.equal(pickerStep(at(9), "right", keys).state.index, 9);
  assert.equal(pickerStep(at(2), "right", keys).state.index, 3);
});

test("picker: down and up move a row, and stop at the edges", () => {
  assert.equal(pickerStep(at(2), "down", keys).state.index, 7);
  assert.equal(pickerStep(at(7), "up", keys).state.index, 2);
  assert.equal(pickerStep(at(7), "down", keys).state.index, 7);
  assert.equal(pickerStep(at(2), "up", keys).state.index, 2);
});

test("picker: a short last row doesn't reach a missing tile", () => {
  assert.equal(pickerStep(at(6, { count: 8 }), "down", keys).state.index, 6);
  assert.equal(pickerStep(at(7, { count: 8 }), "right", keys).state.index, 7);
});

test("picker: enter picks the tile under the cursor, in the look it shows", () => {
  const r = pickerStep(at(6), "enter", keys);
  assert.equal(r.pick, `${keys[6]}:night`);
  assert.equal(r.close, true);
  assert.equal(pickerStep({ ...at(6), keys }, "enter").pick, `${keys[6]}:night`);
  assert.equal(pickerStep({ ...at(6), day: true }, "enter", keys).pick, `${keys[6]}:day`);
});

test("picker: escape closes without a pick", () => {
  const r = pickerStep(at(3), "escape", keys);
  assert.equal(r.close, true);
  assert.equal(r.pick, null);
});

test("picker: n and d set night or day; other keys change nothing", () => {
  assert.equal(pickerStep(at(1), "d", keys).state.day, true);
  assert.equal(pickerStep(at(1, { day: true }), "n", keys).state.day, false);
  const r = pickerStep(at(1), "x", keys);
  assert.deepEqual(r, { state: at(1), pick: null, close: false });
});

test("picker: the input state is not mutated", () => {
  const s = at(4);
  pickerStep(s, "left", keys);
  assert.equal(s.index, 4);
});

test("picker: an empty list never throws", () => {
  assert.equal(pickerStep({ index: 0, day: false, count: 0, cols: 5 }, "enter", []).pick, null);
  assert.equal(pickerStep({ index: 0, day: false, count: 0, cols: 5 }, "escape", []).close, true);
});

test("picker: starts on the shown scene, in the shown appearance", () => {
  const list = sceneList(SCENES);
  assert.equal(pickerStart(list, "hoth", false).index, keys.indexOf("hoth"));
  assert.equal(pickerStart(list, "nope", true).index, 0);
  assert.equal(pickerStart(list, "hoth", true).day, true);
  assert.equal(pickerStart(null, "hoth").count, 0);
});

test("sceneList: every scene's thumbnails exist on disk and carry its needs colours", async () => {
  const { existsSync } = await import("node:fs");
  const list = sceneList(SCENES);
  assert.equal(list.length, 10);
  for (const s of list) {
    for (const t of [s.thumbs.dark, s.thumbs.light]) {
      assert.match(t, /^backgrounds\/thumbs\/[\w-]+\.jpg$/);
      assert.ok(existsSync(new URL(`../herdr/${t}`, import.meta.url)), t);
    }
    assert.deepEqual(s.needs, SCENES[s.key].needs);
  }
});

test("tileInputs: skips entries that aren't scenes and never throws", () => {
  assert.deepEqual(tileInputs(null), []);
  assert.deepEqual(tileInputs([null, {}, { key: "x" }]), []);
  assert.equal(tileInputs(sceneList(SCENES)).length, 10);
});

test("dialogSize: exact content size, 16:9 tiles", () => {
  assert.equal(TILE.h, Math.round((TILE.w * 9) / 16));
  assert.equal(gridHeight(), 336);
  assert.deepEqual(dialogSize(), { width: 1024, height: 412 });
});
