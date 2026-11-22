// kit-scenes' main.js under a stubbed Herdr: the cross button, the c key, the declined tag.
import { host, fakeCx, resetHost } from "./support/herdr-stub.js";
import { test } from "node:test";
import assert from "node:assert/strict";

const { default: KitScenes } = await import("../herdr/mods/kit-scenes/main.js");

const tile = (key, status) => ({ key, label: key, thumbs: { dark: "d.png", light: "l.png" }, needs: { dark: "#ffe5de", light: "#aa3300" }, asks: "x", ...(status ? { status } : {}) });
const THEME = JSON.stringify({ background: "#101010", foreground: "#eeeeee", muted: "#999999", border: "#333333", hover: "#222222", dim: "#777777" });

function start({ cross, scenes = [tile("a"), tile("b", "declined")], scene = "a" } = {}) {
  resetHost();
  host.themeJson = THEME;
  host.props = { overlay: "ov1" };
  host.shared["kit.scenes"] = scenes;
  host.shared["kit.scene"] = scene;
  if (cross !== undefined) host.shared["kit.cross"] = cross;
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

const CROSS = { name: "fixture-alt", label: "Fixture-alt →" };

test("kit-scenes: no cross button without kit.cross, and the hint omits it", () => {
  const { view, cx } = start();
  const root = view.render(cx);
  assert.equal(byId(root, "scene-cross"), undefined);
  assert.ok(texts(root).includes("arrows move · enter picks · esc closes"));
});

test("kit-scenes: the cross button is named, writes kit.layoutWant and closes", () => {
  const { view, cx } = start({ cross: CROSS });
  const root = view.render(cx);
  const btn = byId(root, "scene-cross");
  assert.ok(btn, "a button with an id");
  assert.ok(texts(root).includes("Fixture-alt →"), "named by its label");
  assert.ok(texts(root).some((t) => t.includes("c crosses")));
  btn.calls.find(([k]) => k === "on_click")[1]({}, cx);
  assert.equal(host.shared["kit.layoutWant"], "fixture-alt");
  assert.deepEqual(host.closed, ["ov1"]);
});

test("kit-scenes: the c key does the same, and only while a cross is offered", () => {
  const a = start({ cross: CROSS });
  let stopped = 0;
  a.view.key({ keystroke: "c" }, { ...a.cx, stop_propagation() { stopped++; } });
  assert.equal(host.shared["kit.layoutWant"], "fixture-alt");
  assert.deepEqual(host.closed, ["ov1"]);
  assert.equal(stopped, 1);
  const b = start();
  b.view.key({ keystroke: "c" }, { ...b.cx, stop_propagation() { stopped++; } });
  assert.equal(host.shared["kit.layoutWant"], undefined);
  assert.deepEqual(host.closed, []);
});

test("kit-scenes: a declined tile says declined in words, last in order; a shown declined tile keeps both words", () => {
  const { view, cx } = start({ scenes: [tile("d1", "declined"), tile("t1", "trial"), tile("s", "declined")], scene: "s" });
  assert.deepEqual(view.keys, ["t1", "d1", "s"]);
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
