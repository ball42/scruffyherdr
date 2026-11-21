import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENES, sceneList } from "../herdr/mods/herdr-signals/scenes.js";
import { COLS, ROWS, pickerStart, pickerStep, tileInputs, dialogSize, gridHeight, TILE } from "../herdr/mods/kit-scenes/picker.js";

const keys = Object.keys(SCENES);
const at = (index, extra = {}) => ({ index, day: false, count: 18, cols: 6, ...extra });

test("picker: eighteen scenes in a 6 by 3 grid", () => {
  assert.equal(keys.length, 18);
  assert.equal(COLS, 6);
  assert.equal(ROWS, 3);
  assert.equal(pickerStart(sceneList(SCENES), "hoth").cols, 6);
});

test("picker: the dialog holds every scene, so no tile is clipped", () => {
  assert.ok(COLS * ROWS >= keys.length, `${COLS} x ${ROWS} holds ${keys.length}`);
});

test("picker: right from the end of a row stays put", () => {
  assert.equal(pickerStep(at(5), "right", keys).state.index, 5);
  assert.equal(pickerStep(at(0), "left", keys).state.index, 0);
  assert.equal(pickerStep(at(6), "left", keys).state.index, 6);
  assert.equal(pickerStep(at(17), "right", keys).state.index, 17);
  assert.equal(pickerStep(at(2), "right", keys).state.index, 3);
});

test("picker: down and up move a row, and stop at the edges", () => {
  assert.equal(pickerStep(at(2), "down", keys).state.index, 8);
  assert.equal(pickerStep(at(8), "down", keys).state.index, 14);
  assert.equal(pickerStep(at(14), "up", keys).state.index, 8);
  assert.equal(pickerStep(at(14), "down", keys).state.index, 14);
  assert.equal(pickerStep(at(2), "up", keys).state.index, 2);
});

test("picker: a short last row doesn't reach a missing tile", () => {
  assert.equal(pickerStep(at(9, { count: 14 }), "down", keys).state.index, 9);
  assert.equal(pickerStep(at(13, { count: 14 }), "right", keys).state.index, 13);
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
  assert.equal(pickerStep({ index: 0, day: false, count: 0, cols: 6 }, "enter", []).pick, null);
  assert.equal(pickerStep({ index: 0, day: false, count: 0, cols: 6 }, "escape", []).close, true);
});

test("picker: starts on the shown scene, in the shown appearance", () => {
  const list = sceneList(SCENES);
  assert.equal(pickerStart(list, "hoth", false).index, keys.indexOf("hoth"));
  assert.equal(pickerStart(list, "nope", true).index, 0);
  assert.equal(pickerStart(list, "hoth", true).day, true);
  assert.equal(pickerStart(null, "hoth").count, 0);
});

test("picker: opens on the last tile, and right and down stay there", () => {
  const list = sceneList(SCENES);
  const start = pickerStart(list, "utapau");
  assert.equal(start.index, 17);
  const ks = list.map((s) => s.key);
  assert.equal(pickerStep(start, "right", ks).state.index, 17);
  assert.equal(pickerStep(start, "down", ks).state.index, 17);
});

test("sceneList: every scene's thumbnails exist on disk and carry its needs colours", async () => {
  const { existsSync } = await import("node:fs");
  const list = sceneList(SCENES);
  assert.equal(list.length, keys.length);
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
  assert.equal(tileInputs(sceneList(SCENES)).length, keys.length);
});

test("dialogSize: exact content size, 16:9 tiles", () => {
  assert.equal(TILE.h, Math.round((TILE.w * 9) / 16));
  assert.equal(gridHeight(), 360);
  assert.deepEqual(dialogSize(), { width: 834, height: 436 });
});

test("dialogSize: fits a half-screen window on a 1728 px wide screen", () => {
  assert.ok(dialogSize().width <= 1728 / 2 - 16, `${dialogSize().width} px is wider than half of 1728 less a margin`);
});
