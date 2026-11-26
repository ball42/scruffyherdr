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

// ---- status order, the declined tag, the pages ----
import { orderTiles, pageStep, rowOf, splitPages } from "../herdr/mods/kit-scenes/picker.js";

const tile = (key, status) => ({ key, label: key, thumbs: { dark: "d", light: "l" }, needs: { dark: "#111111", light: "#222222" }, ...(status ? { status } : {}) });

test("picker: sceneList carries a scene file's status and leaves core's tiles without one", () => {
  const core = sceneList(SCENES);
  assert.ok(core.every((s) => !("status" in s)));
  const one = { ...SCENES.hoth, status: "declined" };
  assert.equal(sceneList({ "fixture-scene": one })[0].status, "declined");
});

test("picker: trial tiles come before declined ones, each group in its own order", () => {
  const list = [tile("a", "declined"), tile("b", "trial"), tile("c"), tile("d", "declined"), tile("e", "trial")];
  assert.deepEqual(tileInputs(list).map((t) => t.key), ["b", "c", "e", "a", "d"]);
  assert.equal(tileInputs(list).find((t) => t.key === "a").status, "declined");
  assert.equal(tileInputs(list).find((t) => t.key === "c").status, undefined);
});

test("picker: the core set keeps its order and has no declined tile", () => {
  assert.deepEqual(tileInputs(sceneList(SCENES)).map((t) => t.key), keys);
  assert.deepEqual(orderTiles([tile("x"), tile("y")]).map((t) => t.key), ["x", "y"]);
});

test("splitPages: the core scenes are page 1, a scene file's are page 2, trial before declined; no empty page", () => {
  const tiles = tileInputs([tile("a", "declined"), tile("b", "trial"), tile("c"), tile("d", "declined"), tile("e", "trial"), tile("f")]);
  const pages = splitPages(tiles);
  assert.deepEqual(pages.map((p) => p.map((t) => t.key)), [["c", "f"], ["b", "e", "a", "d"]]);
  assert.deepEqual(splitPages(tileInputs(sceneList(SCENES))).map((p) => p.length), [18]);
  assert.deepEqual(splitPages(tileInputs([tile("x", "trial")])).map((p) => p.length), [1]);
  assert.deepEqual(splitPages(null), []);
  assert.deepEqual(splitPages([]), []);
});

test("pickerStart: opens on the page of the shown scene, with that page's count", () => {
  const tiles = tileInputs([tile("c"), tile("f"), tile("b", "trial"), tile("a", "declined")]);
  assert.deepEqual(pickerStart(tiles, "c"), { index: 0, day: false, count: 2, cols: 6, page: 0, pages: 2 });
  assert.deepEqual(pickerStart(tiles, "a", true), { index: 1, day: true, count: 2, cols: 6, page: 1, pages: 2 });
  assert.equal(pickerStart(tiles, "nope").page, 0);
  assert.equal(pickerStart(sceneList(SCENES), "hoth").pages, 1);
});

test("pageStep: p and pagedown go on, pageup back, wrapping; the cursor lands on the first tile", () => {
  const pages = splitPages(tileInputs([tile("c"), tile("f"), tile("b", "trial")]));
  const start = { ...pickerStart(tileInputs([tile("c"), tile("f"), tile("b", "trial")]), "f"), day: true };
  assert.equal(start.index, 1);
  const two = pageStep(start, "p", pages);
  assert.deepEqual({ page: two.page, index: two.index, count: two.count, day: two.day }, { page: 1, index: 0, count: 1, day: true });
  assert.equal(pageStep(two, "p", pages).page, 0);
  assert.equal(pageStep(two, "pageup", pages).page, 0);
  assert.equal(pageStep(start, "pageup", pages).page, 1);
  assert.equal(pageStep(start, "pagedown", pages).page, 1);
  assert.equal(start.page, 0, "the input state is not mutated");
});

test("pageStep: one page, no pages or another key changes nothing", () => {
  const one = splitPages(tileInputs([tile("c")]));
  const state = pickerStart(tileInputs([tile("c")]), "c");
  assert.equal(pageStep(state, "p", one), state);
  assert.equal(pageStep(state, "p", []), state);
  const two = splitPages(tileInputs([tile("c"), tile("b", "trial")]));
  assert.equal(pageStep(state, "left", two), state);
});

test("picker: more than eighteen tiles scroll past three rows, six columns wide", () => {
  assert.equal(rowOf(0), 0);
  assert.equal(rowOf(5), 0);
  assert.equal(rowOf(6), 1);
  assert.equal(rowOf(23), 3);
  assert.equal(pickerStep(at(17, { count: 24 }), "down", keys).state.index, 23);
  const size = dialogSize();
  assert.equal(size.height, 76 + gridHeight(3));
});
