// herdr-signals' main.js under a stubbed Herdr: how a copy takes its scene
// set from the scene file its block names, and that copies don't leak sets.
import { host, fakeCx, resetHost } from "./support/herdr-stub.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const { default: Signals } = await import("../herdr/mods/herdr-signals/main.js");
const { dress } = await import("../herdr/mods/herdr-signals/dress.js");
const { SCENES, activeScenes, setActiveScenes } = await import("../herdr/mods/herdr-signals/scenes.js");
const { EMPTY_SET_PROBLEM } = await import("../herdr/mods/herdr-signals/view.js");

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

async function start(props, { layoutName, tree, files = {}, sceneWant = null } = {}) {
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

test("an unreadable scene file leaves the layout undressed and says why", async () => {
  const { view } = await start({ layout: "alt", scenes: SCENE_FILE }, { layoutName: "alt", tree: coreTree() });
  assert.equal(sets().length, 0, "no layout.set");
  assert.deepEqual(host.shared["kit.scenes"], []);
  assert.equal(view.sceneProblem(), `${EMPTY_SET_PROBLEM}; scene file can't be read`);
  assert.equal(host.shared["kit.scene"] ?? null, null);
});

test("a scene file whose scenes all fail leaves the layout undressed; problems are capped", async () => {
  const bad = JSON.stringify({ a: { label: "x" }, b: { label: "y" } });
  const { view } = await start({ layout: "alt", scenes: SCENE_FILE }, { layoutName: "alt", tree: coreTree(), files: { [SCENE_FILE]: bad } });
  assert.equal(sets().length, 0);
  assert.deepEqual(host.shared["kit.scenes"], []);
  assert.match(view.sceneProblem(), new RegExp(`^${EMPTY_SET_PROBLEM}; extra scene "a".*\\(\\+\\d+ more\\)$`));
});

test("a scruffy copy started after a scene-file copy shows core's scenes", async () => {
  const altTree = coreTree();
  const scruffyTree = coreTree();
  const alt = await start({ layout: "alt", scenes: SCENE_FILE }, { layoutName: "alt", tree: altTree, files: { [SCENE_FILE]: sceneFile(["fixture-scene"]) } });
  assert.deepEqual(host.shared["kit.scenes"].map((s) => s.key), ["fixture-scene"]);
  assert.deepEqual(Object.keys(activeScenes()), ["fixture-scene"], "the alt layout's set is active in the module");
  await start({}, { layoutName: "scruffy", tree: scruffyTree, sceneWant: "endor" });
  assert.deepEqual(host.shared["kit.scenes"].map((s) => s.key), Object.keys(SCENES));
  assert.equal(host.shared["kit.scenes"].length, 18);
  const last = sets().at(-1)?.[1].layout;
  assert.equal(last?.theme.dark, SCENES.endor.theme.dark, "scruffy dresses the asked core scene");
  // The alt copy's own entry points put its set back.
  alt.view.render(alt.cx);
  assert.deepEqual(Object.keys(activeScenes()), ["fixture-scene"]);
  setActiveScenes(null);
});

test("a scene-file copy never publishes core's scenes into kit.scenes, even before its file loads", async () => {
  await start({ layout: "alt", scenes: SCENE_FILE }, { layoutName: "alt", tree: coreTree(), files: { [SCENE_FILE]: sceneFile(["fixture-scene"]) } });
  const lists = host.sets.filter(([k]) => k === "kit.scenes").map(([, v]) => v.map((s) => s.key));
  assert.ok(lists.length > 0);
  assert.deepEqual(lists, lists.map(() => ["fixture-scene"]), "every kit.scenes write is the file's set");
  setActiveScenes(null);
});

test("kit.tones carries the full tone set for a scene outside core's, and only then", async () => {
  const bare = JSON.parse(sceneFile(["fixture-scene"]));
  delete bare["fixture-scene"].tones.glyph;
  await start({ layout: "alt", scenes: SCENE_FILE }, { layoutName: "alt", tree: coreTree(), files: { [SCENE_FILE]: JSON.stringify(bare) } });
  const order = host.sets.map((x) => x[0]);
  assert.ok(order.indexOf("kit.tones") < order.indexOf("kit.scene"), "kit.tones is written before kit.scene");
  const t = host.shared["kit.tones"];
  assert.equal(t.scene, "fixture-scene");
  assert.equal(t.full.glyph, "layered", "layered even though the entry names no glyph");
  assert.equal(t.full.dark.orange, "#ffe5de");
  assert.equal(t.full.light.ink, "#ffffff");
  setActiveScenes(null);
  await start({}, { layoutName: "scruffy", tree: coreTree() });
  assert.equal(host.shared["kit.tones"].full, undefined, "a core scene publishes no full set");
  setActiveScenes(null);
});

test("a changed scene file re-dresses on the next config tick", async () => {
  const files = { [SCENE_FILE]: sceneFile(["fixture-scene"]) };
  const { cx } = await start({ layout: "alt", scenes: SCENE_FILE }, { layoutName: "alt", tree: coreTree(), files });
  assert.deepEqual(host.shared["kit.scenes"].map((s) => s.key), ["fixture-scene"]);
  host.files[SCENE_FILE] = sceneFile(["fixture-scene", "fixture-two"]);
  await cx.advance(11_000);
  assert.deepEqual(host.shared["kit.scenes"].map((s) => s.key), ["fixture-scene", "fixture-two"]);
  setActiveScenes(null);
});

// Two copies live on one host: only the copy whose layout is shown touches shared keys.
const TWO = JSON.stringify({
  "fixture-scene": entry("fixture-scene"),
  "fixture-two": (() => {
    const e = entry("fixture-two");
    e.theme = { light: "fixture2-day", dark: "fixture2-night" };
    e.needs = { ...SCENES.endor.needs };
    e.tones.dark.orange = SCENES.endor.needs.dark;
    e.tones.light.orange = SCENES.endor.needs.light;
    return e;
  })(),
});
const withBlock = (props) => ({ id: "root", type: "row", children: [{ id: "main", type: "block", content: { tab: "active", pane: {} } }, { id: "strip", type: "block", content: { mod: "herdr-signals", props } }] });

async function twoCopies(other = "alt") {
  setActiveScenes(null);
  const trees = { scruffy: dress(BASE_TREE(), { scene: "naboo" }) };
  host.shared = {}; host.sets = []; host.runs = [];
  host.files = {
    "/app/themes/fixture-night.json": themeText("hoth-night"), "/app/themes/fixture-day.json": themeText("hoth-day"),
    "/app/themes/fixture2-night.json": themeText("endor-night"), "/app/themes/fixture2-day.json": themeText("endor-day"),
    [SCENE_FILE]: TWO,
    [`/app/layouts/${other}.json`]: JSON.stringify(withBlock({ layout: other, scenes: SCENE_FILE })),
    "/app/layouts/scruffy.json": JSON.stringify(withBlock({})),
    "/app/layouts/scruffyherdr.json": JSON.stringify(withBlock({})),
    "/app/layouts/main.json": JSON.stringify(BASE_TREE()),
  };
  host.layouts = [other, "scruffy", "scruffyherdr", "main"];
  host.themeJson = themeText("hoth-night");
  host.shared.layout = other;
  const mk = async (props) => {
    const cx = fakeCx();
    cx.settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };
    const view = new Signals();
    const log = console.log;
    console.log = () => {};
    try { host.props = props; view.init({}, cx); await cx.settle(); } finally { console.log = log; }
    return { cx, view };
  };
  const alt = await mk({ layout: other, scenes: SCENE_FILE });
  const scruffy = await mk({});
  setActiveScenes({ "fixture-scene": entry("fixture-scene") });
  trees[other] = dress(BASE_TREE(), { scene: "fixture-scene" });
  setActiveScenes(null);
  return { alt, scruffy, trees };
}
const quiet = async (cx, ms) => {
  const log = console.log;
  console.log = () => {};
  try { await cx.advance(ms); } finally { console.log = log; }
};
const show = (name, tree, want = null) => { host.shared.layout = name; host.layout = tree; host.shared["kit.sceneWant"] = want; };

test("a copy not on its own layout never writes or clears a shared key", async () => {
  const { alt, scruffy, trees } = await twoCopies();
  // On alt: a request for alt's second scene is served by alt, and scruffy leaves everything alone.
  show("alt", trees.alt, "fixture-two");
  let n = host.sets.length;
  await quiet(scruffy.cx, 11_000);
  assert.equal(host.sets.length, n, "scruffy wrote no shared key while alt is shown");
  assert.equal(host.shared["kit.sceneWant"], "fixture-two", "scruffy left the request");
  assert.equal(host.runs.length, 0);
  await quiet(alt.cx, 11_000);
  assert.equal(host.shared["kit.sceneWant"], null, "alt served it");
  assert.equal(host.shared["kit.scene"], "fixture-two");
  assert.equal(sets().at(-1)[1].layout.theme.dark, "fixture2-night");
  const altScenes = host.shared["kit.scenes"].map((s) => s.key);
  // On scruffy: alt is quiet and keeps the published scene, scruffy serves its own request.
  const runs = host.runs.length;
  show("scruffy", trees.scruffy, "endor");
  n = host.sets.length;
  await quiet(alt.cx, 11_000);
  assert.equal(host.sets.length, n, "alt wrote no shared key while scruffy is shown");
  assert.equal(host.shared["kit.sceneWant"], "endor");
  assert.equal(host.runs.length, runs);
  await quiet(scruffy.cx, 11_000);
  assert.equal(host.shared["kit.sceneWant"], null);
  assert.equal(sets().at(-1)[1].layout.theme.dark, SCENES.endor.theme.dark);
  assert.equal(host.shared["kit.scenes"].length, 18);
  assert.deepEqual(altScenes, ["fixture-scene", "fixture-two"]);
  setActiveScenes(null);
});

test("shown on a layout that is no kit layout, only scruffy switches; the old bare-block layout is no kit layout", async () => {
  const { alt, scruffy } = await twoCopies();
  for (const name of ["main", "scruffyherdr"]) {
    host.runs = [];
    show(name, name === "main" ? BASE_TREE() : withBlock({}), "endor");
    const n = host.sets.length;
    await quiet(alt.cx, 11_000);
    assert.equal(host.sets.length, n, `alt writes nothing on ${name}`);
    assert.equal(host.runs.length, 0);
    await quiet(scruffy.cx, 11_000);
    assert.deepEqual(host.runs.find(([a]) => a === "layout.switch"), ["layout.switch", { name: "scruffy" }], `scruffy switches from ${name}`);
  }
  setActiveScenes(null);
});

test("off every kit layout the scruffy copy works as ever: poll, commands, null scene and view", async () => {
  const { alt, scruffy } = await twoCopies();
  host.agents = [];
  show("main", BASE_TREE());
  host.shared["kit.scene"] = "naboo";
  host.shared["kit.view"] = "focus";
  host.shared["kit.viewWant"] = "grid";
  let n = host.sets.length;
  await quiet(alt.cx, 11_000);
  alt.view.command("view-grid", alt.cx);
  assert.equal(host.sets.length, n, "alt does nothing on main");
  assert.equal(host.shared["kit.scene"], "naboo");
  await quiet(scruffy.cx, 11_000);
  assert.equal(host.shared["kit.scene"], null, "scruffy publishes null as in v0.1.24");
  assert.equal(host.shared["kit.view"], null);
  assert.equal(host.shared["kit.viewWant"], null, "and clears a stray viewWant");
  assert.ok(host.sets.some(([k]) => k === "herdr-kit"), "the poll ran");
  host.shared["kit.viewWant"] = null;
  scruffy.view.command("view-grid", scruffy.cx);
  assert.equal(host.shared["kit.viewWant"], "grid", "a command ran");
  setActiveScenes(null);
});

test("shown on alt: alt does the global work and scruffy none", async () => {
  const { alt, scruffy, trees } = await twoCopies();
  host.agents = [];
  show("alt", trees.alt);
  host.shared["kit.viewWant"] = null;
  let n = host.sets.length;
  await quiet(scruffy.cx, 11_000);
  scruffy.view.command("view-grid", scruffy.cx);
  assert.equal(host.sets.length, n, "scruffy: no poll writes, no command");
  await quiet(alt.cx, 11_000);
  assert.ok(host.sets.some(([k]) => k === "herdr-kit"), "alt polled");
  const before = host.sets.length;
  alt.view.command("view-grid", alt.cx);
  assert.ok(host.sets.length > before && host.shared["kit.viewWant"] === "grid", "alt's command ran");
  setActiveScenes(null);
});

test("shown unknown: only the scruffy copy acts", async () => {
  const { alt, scruffy } = await twoCopies();
  host.agents = [];
  host.shared.layout = undefined;
  host.layout = null;
  const n = host.sets.length;
  await quiet(alt.cx, 11_000);
  alt.view.command("view-grid", alt.cx);
  assert.equal(host.sets.length, n, "alt acts on nothing while the layout is unknown");
  scruffy.view.command("view-grid", scruffy.cx);
  assert.equal(host.shared["kit.viewWant"], "grid");
  setActiveScenes(null);
});

test("kit.cross names the other kit layout; only the owner publishes it; none without one", async () => {
  const { alt, scruffy } = await twoCopies("fixture-alt");
  host.shared.layout = "scruffy";
  host.shared["kit.cross"] = undefined;
  await quiet(scruffy.cx, 11_000);
  assert.deepEqual(host.shared["kit.cross"], { name: "fixture-alt", label: "Fixture-alt →" });
  host.shared.layout = "fixture-alt";
  await quiet(alt.cx, 11_000);
  assert.deepEqual(host.shared["kit.cross"], { name: "scruffy", label: "← Scruffy" });
  // No other kit layout: null, and the key is not an object.
  const solo = await twoCopies("fixture-alt");
  host.layouts = ["scruffy", "scruffyherdr", "main"];
  delete host.files["/app/layouts/fixture-alt.json"];
  host.shared.layout = "scruffy";
  host.shared["kit.cross"] = { name: "stale", label: "stale" };
  await quiet(solo.scruffy.cx, 40_000);
  assert.equal(host.shared["kit.cross"], null);
  setActiveScenes(null);
});

test("kit.layoutWant: the owner switches to a kit layout and clears it; a non-kit name is cleared and ignored", async () => {
  const { alt, scruffy, trees } = await twoCopies("fixture-alt");
  show("scruffy", trees.scruffy);
  host.shared["kit.layoutWant"] = "fixture-alt";
  const runs = host.runs.length;
  await quiet(alt.cx, 11_000);
  assert.equal(host.runs.length, runs, "the hidden copy runs nothing");
  assert.equal(host.shared["kit.layoutWant"], "fixture-alt");
  await quiet(scruffy.cx, 11_000);
  assert.deepEqual(host.runs.slice(runs).filter((r) => r[0] === "layout.switch").map((r) => r[1]), [{ name: "fixture-alt" }]);
  assert.equal(host.shared["kit.layoutWant"], null);
  const n = host.runs.length;
  host.shared["kit.layoutWant"] = "main";
  await quiet(scruffy.cx, 11_000);
  assert.equal(host.runs.length, n, "main is no kit layout");
  assert.equal(host.shared["kit.layoutWant"], null);
  setActiveScenes(null);
});

test("an empty scene set still offers the way out: kit.cross is published and kit.layoutWant is served", async () => {
  const { alt, trees } = await twoCopies("fixture-alt");
  show("fixture-alt", trees["fixture-alt"]);
  await quiet(alt.cx, 11_000);
  assert.equal(host.shared["kit.scene"], "fixture-scene");
  const tones = host.shared["kit.tones"];
  host.files[SCENE_FILE] = "{}";
  host.shared["kit.cross"] = { name: "fixture-alt", label: "stale" };
  show("fixture-alt", trees["fixture-alt"]);
  await quiet(alt.cx, 11_000);
  assert.equal(alt.view.emptySet, true);
  // The last scene and its tones stay: publishing null would draw Tatooine, and the strip already says why.
  assert.equal(host.shared["kit.scene"], "fixture-scene");
  assert.deepEqual(host.shared["kit.tones"], tones);
  assert.deepEqual(host.shared["kit.cross"], { name: "scruffy", label: "← Scruffy" });
  assert.deepEqual(host.shared["kit.scenes"], []);
  host.shared["kit.layoutWant"] = "scruffy";
  const runs = host.runs.length;
  await quiet(alt.cx, 11_000);
  assert.deepEqual(host.runs.slice(runs).filter((r) => r[0] === "layout.switch").map((r) => r[1]), [{ name: "scruffy" }]);
  assert.equal(host.shared["kit.layoutWant"], null);
  setActiveScenes(null);
});

test("a shown scene that leaves the file falls back to the default scene's own theme pair; the note shows once and expires", async () => {
  const { alt, trees } = await twoCopies("fixture-alt");
  show("fixture-alt", trees["fixture-alt"], "fixture-two");
  await quiet(alt.cx, 11_000);
  assert.equal(host.shared["kit.scene"], "fixture-two");
  // The file drops the shown scene.
  host.files[SCENE_FILE] = sceneFile(["fixture-scene"]);
  const n = sets().length;
  await quiet(alt.cx, 11_000);
  const written = sets().slice(n).map((r) => r[1].layout.theme);
  assert.ok(written.length > 0, "the fallback was written");
  assert.deepEqual(written.at(-1), { light: "fixture-day", dark: "fixture-night" }, "the default scene's own pair, no departed half kept");
  assert.equal(host.shared["kit.scene"], "fixture-scene");
  assert.equal(host.shared["kit.sceneWant"], null);
  const note = alt.view.sceneNote;
  assert.match(note?.text ?? "", /"fixture-two" left this layout's scenes; showing "fixture-scene"/);
  // Later passes find the default scene's pair and set no new note; the old one expires.
  await quiet(alt.cx, 11_000);
  assert.equal(alt.view.sceneNote?.at ?? null, note.at, "the note's time is not refreshed");
  alt.view.render(alt.cx);
  assert.equal(alt.view.sceneNote, null, "the note expired");
  setActiveScenes(null);
});

test("alert_colors.scenes may name a scene of either kit layout: neither strip calls the other's key unknown", async () => {
  const { alt, scruffy, trees } = await twoCopies("fixture-alt");
  host.files["/home/test/.config/herdr-kit/config.json"] = JSON.stringify({ alert_colors: { scenes: { naboo: { needs: "#ffd84d" }, "fixture-two": { needs: "#ffd84d" }, nowhere: { needs: "#ffd84d" } } } });
  show("scruffy", trees.scruffy);
  await quiet(scruffy.cx, 40_000);
  assert.equal(scruffy.view.alertProblem, 'alert_colors scenes: no scene named "nowhere"', "scruffy knows the alt layout's keys");
  show("fixture-alt", trees["fixture-alt"]);
  await quiet(alt.cx, 40_000);
  assert.equal(alt.view.alertProblem, 'alert_colors scenes: no scene named "nowhere"', "the alt layout knows core's keys");
  setActiveScenes(null);
});

test("a scene file's theme name that isn't a plain file name is never read, and drops its scene", async () => {
  const bad = JSON.parse(sceneFile(["fixture-scene", "fixture-two"]));
  bad["fixture-two"].theme = { light: "../../etc/day", dark: "fixture-night" };
  const reads = [];
  const files = { [SCENE_FILE]: JSON.stringify(bad) };
  const { view } = await start({ layout: "alt", scenes: SCENE_FILE }, { layoutName: "alt", tree: coreTree(), files });
  // Again with every read recorded: the config tick rereads the file and its themes.
  host.files = new Proxy(host.files, { has: (t, p) => { reads.push(p); return p in t; } });
  view.sceneSig = null;
  await view.loadScenes();
  assert.ok(reads.length > 0);
  assert.ok(!reads.some((p) => p.includes("..")), `no read outside themes/: ${reads.filter((p) => p.includes(".."))}`);
  assert.deepEqual(host.shared["kit.scenes"].map((s) => s.key), ["fixture-scene"]);
  assert.match(view.sceneProblem(), /fixture-two.*\.\.\/\.\.\/etc\/day/);
  setActiveScenes(null);
});
