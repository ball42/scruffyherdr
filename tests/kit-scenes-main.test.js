// kit-scenes' main.js under a stubbed Herdr: the second page, its button and keys, the declined tag.
import { host, fakeCx, resetHost } from "./support/herdr-stub.js";
import { test } from "node:test";
import assert from "node:assert/strict";

const { default: KitScenes } = await import("../herdr/mods/kit-scenes/main.js");

const tile = (key, status) => ({ key, label: key, thumbs: { dark: "d.png", light: "l.png" }, needs: { dark: "#ffe5de", light: "#aa3300" }, asks: "x", ...(status ? { status } : {}) });
const THEME = JSON.stringify({ background: "#101010", foreground: "#eeeeee", muted: "#999999", border: "#333333", hover: "#222222", dim: "#777777" });

function start({ scenes = [tile("a"), tile("b", "declined")], scene = "a" } = {}) {
  resetHost();
  host.themeJson = THEME;
  host.props = { overlay: "ov1" };
  host.shared["kit.scenes"] = scenes;
  host.shared["kit.scene"] = scene;
  const cx = fakeCx();
  cx.focus_handle = () => ({ focus() {} });
  const view = new KitScenes();
  view.init({}, cx);
  return { view, cx };
}

// Every element reachable from the render, flattened.
function walk(el, out = []) {
  if (!el || typeof el !== "object" || !Array.isArray(el.calls) || out.includes(el)) return out;
  out.push(el);
  for (const [, ...args] of el.calls) for (const a of args.flat()) walk(a, out);
  return out;
}
const byId = (root, id) => walk(root).find((e) => e.calls.some(([k, v]) => k === "id" && v === id));
const texts = (root) => walk(root).flatMap((e) => e.calls.filter(([k]) => k === "child").map(([, c]) => c)).filter((c) => typeof c === "string");

const call = (el, name) => el.calls.find(([k]) => k === name);
const TWO = [tile("a"), tile("c"), tile("t1", "trial"), tile("d1", "declined")];

test("kit-scenes: with no extra scenes there is one page: no page button, and the hint omits it", () => {
  const { view, cx } = start({ scenes: [tile("a"), tile("c")] });
  const root = view.render(cx);
  assert.equal(byId(root, "scene-page"), undefined);
  assert.ok(texts(root).includes("arrows move · enter picks · esc closes"));
  // p changes nothing, and the key handler leaves it alone.
  let stopped = 0;
  view.key({ keystroke: "p" }, { ...cx, stop_propagation() { stopped++; } });
  assert.equal(view.state.page, 0);
  assert.equal(stopped, 0);
});

test("kit-scenes: page 1 shows the core scenes; the page button is named, a Tab stop with a focus ring", () => {
  const { view, cx } = start({ scenes: TWO });
  const root = view.render(cx);
  assert.deepEqual(view.tiles.map((t) => t.key), ["a", "c"]);
  assert.ok(byId(root, "scene-a") && byId(root, "scene-c"));
  assert.equal(byId(root, "scene-t1"), undefined);
  const btn = byId(root, "scene-page");
  assert.ok(btn, "a button with an id");
  assert.ok(call(btn, "role") && call(btn, "role")[1] === "button");
  assert.equal(call(btn, "accessibility_label")[1], "Scenes page 1 of 2: show more scenes");
  assert.equal(call(btn, "tab_index")[1], 0);
  assert.ok(call(btn, "focus"), "a focus ring");
  assert.ok(texts(root).includes("page 1 of 2"));
  assert.ok(texts(root).some((t) => t.includes("more scenes")));
  assert.ok(texts(root).some((t) => t.includes("p page")));
});

test("kit-scenes: the page button shows page 2, trial before declined, and back again", () => {
  const { view, cx } = start({ scenes: TWO });
  call(byId(view.render(cx), "scene-page"), "on_click")[1]({}, cx);
  assert.equal(view.state.page, 1);
  assert.deepEqual(view.tiles.map((t) => t.key), ["t1", "d1"]);
  const root = view.render(cx);
  assert.ok(byId(root, "scene-t1") && byId(root, "scene-d1-declined"));
  assert.equal(byId(root, "scene-a"), undefined);
  assert.ok(texts(root).includes("page 2 of 2"));
  assert.equal(call(byId(root, "scene-page"), "accessibility_label")[1], "Scenes page 2 of 2: show core scenes");
  call(byId(root, "scene-page"), "on_click")[1]({}, cx);
  assert.equal(view.state.page, 0);
});

test("kit-scenes: p, pagedown and pageup flip the page; enter on page 2 picks that page's scene", () => {
  const { view, cx } = start({ scenes: TWO });
  let stopped = 0;
  const kcx = { ...cx, stop_propagation() { stopped++; } };
  view.key({ keystroke: "p" }, kcx);
  assert.equal(view.state.page, 1);
  assert.equal(stopped, 1);
  view.key({ keystroke: "pageup" }, kcx);
  assert.equal(view.state.page, 0);
  view.key({ keystroke: "pagedown" }, kcx);
  view.key({ keystroke: "down" }, kcx);
  assert.equal(view.state.index, 0, "page 2 has one row");
  view.key({ keystroke: "right" }, kcx);
  view.key({ keystroke: "enter" }, kcx);
  assert.equal(host.shared["kit.sceneWant"], "d1:night");
  assert.deepEqual(host.closed, ["ov1"]);
});

test("kit-scenes: it opens on the page of the shown scene", () => {
  const { view } = start({ scenes: TWO, scene: "d1" });
  assert.equal(view.state.page, 1);
  assert.equal(view.state.index, 1);
});

test("kit-scenes: a declined tile says declined in words, last in order; a shown declined tile keeps both words", () => {
  const { view, cx } = start({ scenes: [tile("d1", "declined"), tile("t1", "trial"), tile("s", "declined")], scene: "s" });
  assert.deepEqual(view.tiles.map((t) => t.key), ["t1", "d1", "s"]);
  const root = view.render(cx);
  assert.ok(byId(root, "scene-d1-declined"));
  assert.ok(byId(root, "scene-s-declined"));
  assert.equal(byId(root, "scene-t1-declined"), undefined);
  // Both words are drawn on a tile that is shown and declined: "declined" on the picture, "shown" in the label row.
  assert.ok(texts(root).includes("declined"));
  assert.ok(texts(root).includes("shown"), "shown keeps its word on a declined tile");
  const decl = byId(root, "scene-s-declined");
  assert.ok(decl.calls.some(([k]) => k === "absolute"), "the tag sits on the picture, not in the label row");
  const row = walk(root).find((e) => e.calls.some(([k, v]) => k === "id" && v === "scene-s"));
  assert.ok(!walk(row).some((e) => e.calls.some(([k, v]) => k === "child" && v === "declined") && !e.calls.some(([k]) => k === "absolute")), "no declined word in the label row");
});

test("kit-scenes: close releases the scroll handle", async () => {
  const { view } = start();
  const handle = view.scroll;
  await view.close();
  assert.equal(handle.released, true);
  assert.equal(view.scroll, null);
});
