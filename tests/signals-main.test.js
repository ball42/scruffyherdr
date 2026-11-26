// herdr-signals' main.js under a stubbed Herdr: how scruffy takes the extra
// scenes of the scene file its block names, that a bad file leaves the core
// scenes working, and that a copy of a retired second layout stays out of the way.
import { host, fakeCx, resetHost } from "./support/herdr-stub.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const { default: Signals } = await import("../herdr/mods/herdr-signals/main.js");
const { dress } = await import("../herdr/mods/herdr-signals/dress.js");
const { SCENES, activeScenes, setActiveScenes } = await import("../herdr/mods/herdr-signals/scenes.js");

const realNow = Date.now;
Date.now = () => host.now;
test.after(() => { Date.now = realNow; });

const themeText = (n) => readFileSync(new URL(`../herdr/themes/${n}.json`, import.meta.url), "utf8");
const SCENE_FILE = "/overlay/scenes.json";
const entry = (label) => ({
  label,
  theme: { light: "fixture-day", dark: "fixture-night" },
  walls: { dark: "backgrounds/fixture.jpg", light: "backgrounds/fixture-day.jpg" },
  panel: { dark: "#0f1726", light: "#f6f9fc" },
  needs: { dark: "#ffe5de", light: "#d76549" },
  asks: "*",
  status: "trial",
  tones: { glyph: "layered", dark: { orange: "#ffe5de", blue: "#58a6ff", ink: "#0d1117" }, light: { orange: "#d76549", blue: "#0969da", ink: "#ffffff" } },
});
const sceneFile = (keys) => JSON.stringify(Object.fromEntries(keys.map((k) => [k, entry(k)])));
const BASE_TREE = () => ({
  id: "root", type: "row", children: [
    { id: "sidebar", type: "block", size: { px: 220 } },
    { id: "main", type: "block", size: { weight: 1 }, content: { tab: "active", pane: {} } },
    { id: "strip", type: "block", size: { px: 30 }, content: { mod: "herdr-signals", props: {} } },
  ],
});
const coreTree = () => { setActiveScenes(null); return dress(BASE_TREE(), { scene: "naboo" }); };
const sets = () => host.runs.filter(([a]) => a === "layout.set");

async function start(props, { layoutName = "scruffy", tree, files = {}, sceneWant = null } = {}) {
  host.shared = {};
  host.sets = [];
  host.runs = [];
  host.files = {
    [`/app/themes/fixture-night.json`]: themeText("hoth-night"),
    [`/app/themes/fixture-day.json`]: themeText("hoth-day"),
    ...files,
  };
  host.themeJson = themeText("hoth-night");
  host.shared.layout = layoutName;
  host.shared["kit.sceneWant"] = sceneWant;
  host.layout = tree;
  host.layouts = [layoutName];
  host.files[`/app/layouts/${layoutName}.json`] = JSON.stringify(tree);
  const cx = fakeCx();
  cx.settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };
  const view = new Signals();
  const log = console.log;
  console.log = () => {};
  try {
    host.props = props; view.init({}, cx); // as Herdr: block props through props(), none to init()
    await cx.settle();
    await cx.advance(11_000);
  } finally {
    console.log = log;
  }
  return { cx, view };
}

const keys = (list) => list.map((s) => s.key);
const CORE = Object.keys(SCENES);
const FILE_BLOCK = { layout: "scruffy", scenes: SCENE_FILE };

test("a scene file's scenes come after the core scenes in kit.scenes; the core list is published first", async () => {
  await start(FILE_BLOCK, { tree: coreTree(), files: { [SCENE_FILE]: sceneFile(["fixture-scene"]) } });
  const lists = host.sets.filter(([k]) => k === "kit.scenes").map(([, v]) => keys(v));
  assert.deepEqual(lists[0], CORE, "the core list at once, before the file loads");
  assert.deepEqual(lists.at(-1), [...CORE, "fixture-scene"]);
  assert.ok(lists.every((l) => CORE.every((k, i) => l[i] === k)), "core is never absent or reordered");
  const extra = host.shared["kit.scenes"].at(-1);
  assert.equal(extra.status, "trial");
  assert.ok(host.shared["kit.scenes"].slice(0, 18).every((s) => !("status" in s)));
  setActiveScenes(null);
});

test("an unreadable scene file leaves the core scenes working, and the strip says why", async () => {
  const { view } = await start(FILE_BLOCK, { tree: coreTree(), sceneWant: "endor" });
  assert.deepEqual(keys(host.shared["kit.scenes"]), CORE);
  assert.equal(view.sceneProblem(), "herdr-signals: scene file can't be read");
  assert.equal(sets().at(-1)?.[1].layout.theme.dark, SCENES.endor.theme.dark, "a core pick still dresses the layout");
  assert.equal(host.shared["kit.scene"], "endor");
  setActiveScenes(null);
});

test("a scene file whose scenes all fail leaves the core scenes working; problems are capped", async () => {
  const bad = JSON.stringify({ a: { label: "x" }, b: { label: "y" } });
  const { view } = await start(FILE_BLOCK, { tree: coreTree(), files: { [SCENE_FILE]: bad }, sceneWant: "hoth" });
  assert.deepEqual(keys(host.shared["kit.scenes"]), CORE);
  assert.match(view.sceneProblem(), /^herdr-signals: extra scene "a".*\(\+\d+ more\)$/);
  assert.equal(sets().at(-1)?.[1].layout.theme.dark, SCENES.hoth.theme.dark);
  setActiveScenes(null);
});

test("a file with one bad scene keeps the good ones and names the bad one", async () => {
  const raw = JSON.parse(sceneFile(["fixture-scene"]));
  const { view } = await start(FILE_BLOCK, { tree: coreTree(), files: { [SCENE_FILE]: JSON.stringify({ ...raw, broken: { label: "x" } }) } });
  assert.deepEqual(keys(host.shared["kit.scenes"]), [...CORE, "fixture-scene"]);
  assert.match(view.sceneProblem(), /^herdr-signals: extra scene "broken"/);
  setActiveScenes(null);
});

test("a file with no scene in it is no problem; the picker has one page", async () => {
  const { view } = await start(FILE_BLOCK, { tree: coreTree(), files: { [SCENE_FILE]: "{}" } });
  assert.deepEqual(keys(host.shared["kit.scenes"]), CORE);
  assert.equal(view.sceneProblem(), null);
  setActiveScenes(null);
});

test("a pick of an extra scene dresses the layout in its theme pair; a core pick still works beside it", async () => {
  const files = { [SCENE_FILE]: sceneFile(["fixture-scene"]) };
  const { cx } = await start(FILE_BLOCK, { tree: coreTree(), files, sceneWant: "fixture-scene:night" });
  assert.equal(host.shared["kit.sceneWant"], null);
  assert.equal(host.shared["kit.scene"], "fixture-scene");
  assert.deepEqual(sets().at(-1)[1].layout.theme, { light: "fixture-day", dark: "fixture-night" });
  host.shared["kit.sceneWant"] = "endor";
  await quiet(cx, 11_000);
  assert.equal(host.shared["kit.scene"], "endor");
  assert.equal(sets().at(-1)[1].layout.theme.dark, SCENES.endor.theme.dark);
  setActiveScenes(null);
});

test("kit.tones carries the full tone set for a scene outside core's, and only then", async () => {
  const bare = JSON.parse(sceneFile(["fixture-scene"]));
  delete bare["fixture-scene"].tones.glyph;
  await start(FILE_BLOCK, { tree: coreTree(), files: { [SCENE_FILE]: JSON.stringify(bare) }, sceneWant: "fixture-scene" });
  const order = host.sets.map((x) => x[0]);
  assert.ok(order.indexOf("kit.tones") < order.indexOf("kit.scene"), "kit.tones is written before kit.scene");
  const t = host.shared["kit.tones"];
  assert.equal(t.scene, "fixture-scene");
  assert.equal(t.full.glyph, "layered", "layered even though the entry names no glyph");
  assert.equal(t.full.dark.orange, "#ffe5de");
  assert.equal(t.full.light.ink, "#ffffff");
  setActiveScenes(null);
  await start({}, { tree: coreTree() });
  assert.equal(host.shared["kit.tones"].full, undefined, "a core scene publishes no full set");
  setActiveScenes(null);
});

test("a changed scene file updates the second page on the next config tick", async () => {
  const files = { [SCENE_FILE]: sceneFile(["fixture-scene"]) };
  const { cx } = await start(FILE_BLOCK, { tree: coreTree(), files });
  assert.deepEqual(keys(host.shared["kit.scenes"]), [...CORE, "fixture-scene"]);
  host.files[SCENE_FILE] = sceneFile(["fixture-scene", "fixture-two"]);
  await cx.advance(11_000);
  assert.deepEqual(keys(host.shared["kit.scenes"]), [...CORE, "fixture-scene", "fixture-two"]);
  setActiveScenes(null);
});

test("a file that turns bad after it loaded drops the second page; the core scenes keep working", async () => {
  const files = { [SCENE_FILE]: sceneFile(["fixture-scene"]) };
  const { cx, view } = await start(FILE_BLOCK, { tree: coreTree(), files });
  assert.equal(host.shared["kit.scenes"].length, 19);
  host.files[SCENE_FILE] = "{nope";
  await cx.advance(11_000);
  assert.deepEqual(keys(host.shared["kit.scenes"]), CORE);
  assert.equal(view.sceneProblem(), "herdr-signals: scene file isn't JSON");
  host.shared["kit.sceneWant"] = "hoth";
  await quiet(cx, 11_000);
  assert.equal(host.shared["kit.scene"], "hoth");
  host.shared["kit.sceneWant"] = "fixture-scene";
  await quiet(cx, 11_000);
  assert.equal(host.shared["kit.sceneWant"], null, "a request for a scene that is gone is dropped");
  assert.match(view.sceneNote?.text ?? "", /no scene "fixture-scene"/);
  setActiveScenes(null);
});

test("alert_colors.scenes may name a scene of the file, and a key in neither is named", async () => {
  const config = JSON.stringify({ alert_colors: { scenes: { naboo: { needs: "#ffd84d" }, "fixture-scene": { needs: "#ffd84d" }, nowhere: { needs: "#ffd84d" } } } });
  const files = { [SCENE_FILE]: sceneFile(["fixture-scene"]), "/home/test/.config/herdr-kit/config.json": config };
  const { view } = await start(FILE_BLOCK, { tree: coreTree(), files });
  assert.equal(view.alertProblem, 'alert_colors scenes: no scene named "nowhere"');
  setActiveScenes(null);
});

test("a scene file's theme name that isn't a plain file name is never read, and drops its scene", async () => {
  const bad = JSON.parse(sceneFile(["fixture-scene", "fixture-two"]));
  bad["fixture-two"].theme = { light: "../../etc/day", dark: "fixture-night" };
  const reads = [];
  const files = { [SCENE_FILE]: JSON.stringify(bad) };
  const { view } = await start(FILE_BLOCK, { tree: coreTree(), files });
  // Again with every read recorded: the config tick rereads the file and its themes.
  host.files = new Proxy(host.files, { has: (t, p) => { reads.push(p); return p in t; } });
  view.sceneSig = null;
  await view.loadScenes();
  assert.ok(reads.length > 0);
  assert.ok(!reads.some((p) => p.includes("..")), `no read outside themes/: ${reads.filter((p) => p.includes(".."))}`);
  assert.deepEqual(keys(host.shared["kit.scenes"]), [...CORE, "fixture-scene"]);
  assert.match(view.sceneProblem(), /fixture-two.*\.\.\/\.\.\/etc\/day/);
  setActiveScenes(null);
});

// A window left on the old second kit layout (lab): its copy is retired and stays out of the way.
const withBlock = (props) => ({ id: "root", type: "row", children: [{ id: "main", type: "block", content: { tab: "active", pane: {} } }, { id: "strip", type: "block", content: { mod: "herdr-signals", props } }] });

test("a retired layout's copy writes no shared key, sets no layout, and leaves the live copy's scenes alone", async () => {
  const live = await start(FILE_BLOCK, { tree: coreTree(), files: { [SCENE_FILE]: sceneFile(["fixture-scene"]) } });
  assert.deepEqual(Object.keys(activeScenes()), [...CORE, "fixture-scene"]);
  const lab = withBlock({ layout: "lab", scenes: SCENE_FILE });
  const old = await start({ layout: "lab", scenes: SCENE_FILE }, { layoutName: "lab", tree: lab, files: { [SCENE_FILE]: sceneFile(["fixture-scene"]) } });
  assert.equal(old.view.retired, true);
  assert.equal(old.view.owns(), false);
  assert.equal(host.sets.filter(([k]) => k === "kit.scenes").length, 0, "no kit.scenes from a retired copy");
  assert.equal(sets().length, 0);
  assert.equal(host.runs.length, 0);
  assert.deepEqual(Object.keys(activeScenes()), [...CORE, "fixture-scene"], "a retired copy never resets the module's scenes");
  old.view.command("view-grid", old.cx);
  assert.equal(host.shared["kit.viewWant"] ?? null, null, "its commands do nothing");
  live.view.render(live.cx);
  assert.deepEqual(Object.keys(activeScenes()), [...CORE, "fixture-scene"]);
  setActiveScenes(null);
});

test("a retired copy's strip says the layout is retired", async () => {
  const { view } = await start({ layout: "lab", scenes: SCENE_FILE }, { layoutName: "lab", tree: withBlock({ layout: "lab", scenes: SCENE_FILE }) });
  const seen = [];
  const walk = (el) => {
    if (!el || typeof el !== "object" || !Array.isArray(el.calls) || seen.includes(el)) return;
    seen.push(el);
    for (const [, ...args] of el.calls) for (const a of args.flat()) { if (typeof a === "string") seen.push(a); else walk(a); }
  };
  walk(view.render(fakeCx()));
  assert.ok(seen.some((x) => typeof x === "string" && x.includes("this layout is retired; switch to scruffy")));
  setActiveScenes(null);
});

test("a window on a layout that is no kit layout (main, lab, the old bare layout): a scene request switches to scruffy", async () => {
  for (const name of ["main", "lab"]) {
    const { cx } = await start({}, { tree: coreTree() });
    host.layouts = [name, "scruffy", "main"];
    host.files["/app/layouts/scruffy.json"] = JSON.stringify(withBlock({}));
    host.runs = [];
    host.shared.layout = name;
    host.layout = name === "main" ? BASE_TREE() : withBlock({ layout: "lab", scenes: SCENE_FILE });
    host.shared["kit.sceneWant"] = "endor";
    await quiet(cx, 11_000);
    assert.deepEqual(host.runs.find(([a]) => a === "layout.switch"), ["layout.switch", { name: "scruffy" }], `switches from ${name}`);
  }
  setActiveScenes(null);
});

test("off the kit layout the scruffy copy works as ever: poll, commands, null scene and view", async () => {
  const { cx, view } = await start({}, { tree: BASE_TREE(), layoutName: "main" });
  host.agents = [];
  host.shared["kit.scene"] = "naboo";
  host.shared["kit.view"] = "focus";
  host.shared["kit.viewWant"] = "grid";
  await quiet(cx, 11_000);
  assert.equal(host.shared["kit.scene"], null, "scruffy publishes null as in v0.1.24");
  assert.equal(host.shared["kit.view"], null);
  assert.equal(host.shared["kit.viewWant"], null, "and clears a stray viewWant");
  assert.ok(host.sets.some(([k]) => k === "herdr-kit"), "the poll ran");
  host.shared["kit.viewWant"] = null;
  view.command("view-grid", cx);
  assert.equal(host.shared["kit.viewWant"], "grid", "a command ran");
  setActiveScenes(null);
});

const quiet = async (cx, ms) => {
  const log = console.log;
  console.log = () => {};
  try { await cx.advance(ms); } finally { console.log = log; }
};

// The card hook can't read Herdr's shared store, so the owner copy
// mirrors kit.runsDismissed to a file, and the open-runs note marks those cards.
test("the owner mirrors kit.runsDismissed to runs-dismissed.json, only when it changes", async () => {
  const FILE = "/home/test/.config/herdr-kit/runs-dismissed.json";
  const { cx } = await start({}, { layoutName: "scruffy", tree: coreTree() });
  assert.deepEqual(JSON.parse(host.files[FILE]), {}, "written once with nothing dismissed");
  host.shared["kit.runsDismissed"] = { "t1:abc": true };
  await quiet(cx, 3_000);
  assert.deepEqual(JSON.parse(host.files[FILE]), { "t1:abc": true });
  const n = host.writes.filter((p) => p === FILE).length;
  await quiet(cx, 6_000);
  assert.equal(host.writes.filter((p) => p === FILE).length, n, "no rewrite while it stays the same");
  setActiveScenes(null);
});
