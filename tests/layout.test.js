import { test } from "node:test";
import assert from "node:assert/strict";
import { withSignals } from "../scripts/make-layout.js";

const base = {
  id: "root", type: "row", children: [
    { id: "sidebar", type: "column", children: [] },
    { id: "work", type: "column", children: [
      { id: "tabs", type: "block", content: { mod: "tabs" } },
      { id: "status", type: "block", size: { px: 28 }, content: { mod: "workspace-status" } },
    ] },
  ],
};

test("status bar becomes a row with the signals strip", () => {
  const out = withSignals(base);
  const status = out.children[1].children[1];
  assert.equal(status.id, "status");
  assert.equal(status.type, "row");
  assert.deepEqual(status.size, { px: 28 });
  assert.equal(status.children[0].content.mod, "workspace-status");
  assert.equal(status.children[1].content.mod, "herdr-signals");
  assert.deepEqual(status.children[1].size, { px: 300 });
});

test("does not mutate the input", () => {
  const before = JSON.stringify(base);
  withSignals(base);
  assert.equal(JSON.stringify(base), before);
});

test("is idempotent", () => {
  const once = withSignals(base);
  assert.deepEqual(withSignals(once), once);
});

test("throws when there is no status block", () => {
  assert.throws(() => withSignals({ id: "root", type: "row", children: [] }), /status/);
});

import { withKitChrome } from "../scripts/make-layout.js";

const herdrMain = {
  id: "root", type: "row", children: [
    { id: "sidebar", type: "column", size: { px: 268 }, children: [
      { id: "sidebar-lists", type: "column", children: [
        { id: "spaces", type: "block", content: { mod: "spaces" } },
        { id: "agents", type: "block", content: { mod: "agents" } },
      ] },
    ] },
    { id: "work", type: "column", children: [
      { id: "tabs", type: "block", size: { px: 42 }, content: { mod: "tabs" } },
      { id: "work-body", type: "row", children: [
        { id: "main", type: "block", content: { tab: "active", pane: { header: { content: { mod: "pane" }, height: 30 } } } },
        { id: "panel", type: "column", hidden: true, children: [] },
      ] },
    ] },
  ],
};
const node = (l, id) => {
  if (l.id === id) return l;
  for (const c of l.children ?? []) { const n = node(c, id); if (n) return n; }
  return null;
};

test("kit chrome swaps tabs and pane header", () => {
  const out = withKitChrome(herdrMain);
  assert.deepEqual(node(out, "tabs").content, { mod: "kit-tabs" });
  assert.deepEqual(node(out, "main").content.pane.header.content, { mod: "kit-pane" });
  assert.equal(node(out, "main").content.pane.header.height, 30);
});

test("adds rail to work-body", () => {
  const body = node(withKitChrome(herdrMain), "work-body");
  const rail = body.children.at(-1);
  assert.deepEqual(rail, { id: "rail", type: "block", size: { px: 260 }, min: 200, max: 420, content: { mod: "kit-rail" } });
});

test("hides agents block and narrows sidebar", () => {
  const out = withKitChrome(herdrMain);
  assert.equal(node(out, "agents").hidden, true);
  assert.deepEqual(node(out, "sidebar").size, { px: 200 });
});

test("kit chrome is idempotent and pure", () => {
  const before = JSON.stringify(herdrMain);
  const once = withKitChrome(herdrMain);
  assert.deepEqual(withKitChrome(once), once);
  assert.equal(JSON.stringify(herdrMain), before);
});

test("kit chrome throws without work-body", () => {
  assert.throws(() => withKitChrome({ id: "root", type: "row", children: [] }), /work-body/);
});

import { pickView } from "../scripts/make-layout.js";

test("pickView maps an old layout to the scene and view it showed", () => {
  assert.equal(pickView("kamino-grid"), "kamino grid");
  assert.equal(pickView("endor"), "endor focus");
  assert.equal(pickView("scruffy"), "");
  assert.equal(pickView("main"), "tatooine focus");
  assert.equal(pickView(""), "tatooine focus");
  assert.equal(pickView("kit", '{"light":"endor-day","dark":"github-dark-colorblind"}'), "endor focus");
  assert.equal(pickView("kit-grid", "endor-night"), "endor grid");
  assert.equal(pickView("kit", ""), "tatooine focus");
  assert.equal(pickView("main", "endor-day"), "tatooine focus");
});

test("pickView reads the layout's old name, scruffyherdr, from its tree", () => {
  const kamino = { id: "root", theme: { light: "kamino-day", dark: "kamino-night" }, children: [{ id: "kit-grid", type: "column", children: [] }] };
  assert.equal(pickView("scruffyherdr", "", kamino), "kamino grid");
  assert.equal(pickView("scruffyherdr", "", { id: "root", theme: { light: "endor-day", dark: "endor-night" }, children: [{ id: "main" }] }), "endor focus");
  assert.equal(pickView("scruffyherdr", "", null), "", "no old file: no scene to impose");
});

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAKE = new URL("../scripts/make-layout.js", import.meta.url).pathname;
const MAIN = {
  id: "root", type: "row", children: [
    { id: "sidebar", type: "column", size: { px: 268 }, children: [{ id: "agents", type: "block", content: { mod: "agents" } }] },
    { id: "work", type: "column", children: [
      { id: "tabs", type: "block", size: { px: 42 }, content: { mod: "tabs" } },
      { id: "work-body", type: "row", children: [{ id: "main", type: "block", content: { tab: "active" } }] },
      { id: "status", type: "block", content: { mod: "workspace-status" } },
    ] },
  ],
};
/** A fake app home and kit home: <app>/layouts/main.json and <kit>/config.json. */
function homes(config = {}) {
  const root = mkdtempSync(join(tmpdir(), "make-layout-"));
  const dir = join(root, "app", "layouts");
  const kit = join(root, "kit");
  mkdirSync(join(dir, ".state"), { recursive: true });
  mkdirSync(kit, { recursive: true });
  writeFileSync(join(dir, "main.json"), JSON.stringify(MAIN));
  writeFileSync(join(kit, "config.json"), JSON.stringify(config));
  return { dir, kit, cfg: join(kit, "config.json"), main: join(dir, "main.json") };
}
const build = (h, ...extra) => spawnSync("node", [MAKE, h.main, h.dir, h.cfg, ...extra], { encoding: "utf8" });
const read = (f) => JSON.parse(readFileSync(f, "utf8"));

test("make-layout builds one scruffy.json in focus and layout-focus.json beside the config", () => {
  const h = homes();
  const r = build(h);
  assert.equal(r.status, 0, r.stderr);
  const files = readdirSync(h.dir).filter((f) => f.endsWith(".json")).sort();
  assert.deepEqual(files, ["main.json", "scruffy.json"]);
  const out = read(join(h.dir, "scruffy.json"));
  assert.deepEqual(out.theme, { light: "tatooine-day", dark: "tatooine-night" });
  assert.equal(out.preview, "layouts/scruffy.svg");
  assert.equal(node(out, "rail").content.mod, "kit-rail");
  assert.equal(node(out, "kit-grid"), null, "focus, not grid");
  const focus = read(join(h.kit, "layout-focus.json"));
  assert.equal(focus.theme, undefined, "the focus file is undressed");
  assert.equal(focus.background, undefined);
  assert.equal(node(focus, "rail").content.mod, "kit-rail");
  assert.ok(existsSync(join(h.kit, "layout-source.json")));
});

test("make-layout takes the scene from --scene, else the existing file, else the default", () => {
  const h = homes();
  build(h, "--scene", "kamino");
  assert.equal(read(join(h.dir, "scruffy.json")).theme.dark, "kamino-night");
  build(h);
  assert.equal(read(join(h.dir, "scruffy.json")).theme.dark, "kamino-night", "a rebuild keeps the scene");
  const r = build(h, "--scene", "nope");
  assert.equal(r.status, 0);
  assert.match(r.stderr, /nope/);
  assert.equal(read(join(h.dir, "scruffy.json")).theme.dark, "kamino-night", "an unknown --scene falls back");
});

test("make-layout keeps panel sizes from the existing file and its .state, and never writes .state", () => {
  const h = homes();
  build(h);
  const f = join(h.dir, "scruffy.json");
  const t = read(f);
  node(t, "rail").size = { px: 300 };
  writeFileSync(f, JSON.stringify(t));
  const state = join(h.dir, ".state", "scruffy.json");
  const stateText = JSON.stringify({ nodes: { sidebar: { size: { px: 333 } } }, theme: { light: "endor-day", dark: "endor-night" } });
  writeFileSync(state, stateText);
  const before = statSync(state).mtimeMs;
  build(h);
  const out = read(f);
  assert.deepEqual(node(out, "rail").size, { px: 300 });
  assert.deepEqual(node(out, "sidebar").size, { px: 333 });
  assert.deepEqual(out.theme, { light: "tatooine-day", dark: "tatooine-night" }, "a .state theme pick is not a click to keep");
  assert.equal(readFileSync(state, "utf8"), stateText);
  assert.equal(statSync(state).mtimeMs, before);
});

test("make-layout survives a malformed existing file or .state", () => {
  const h = homes();
  writeFileSync(join(h.dir, "scruffy.json"), "{");
  writeFileSync(join(h.dir, ".state", "scruffy.json"), "{\"nodes\":");
  const r = build(h);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(join(h.dir, "scruffy.json")).theme.dark, "tatooine-night");
});

test("make-layout rebuilds a grid file as focus, keeping shared sizes but not the grid's rail", () => {
  const h = homes();
  build(h, "--scene", "endor");
  const f = join(h.dir, "scruffy.json");
  const t = read(f);
  node(t, "work-body").children = [{ id: "kit-grid", type: "column", children: [] }, node(t, "rail")];
  node(t, "rail").size = { px: 410 };
  node(t, "sidebar").size = { px: 250 };
  writeFileSync(f, JSON.stringify(t));
  build(h);
  const out = read(f);
  assert.equal(node(out, "kit-grid"), null);
  assert.ok(node(out, "main"));
  assert.deepEqual(node(out, "sidebar").size, { px: 250 });
  assert.deepEqual(node(out, "rail").size, { px: 260 }, "the rail's grid size stays with the grid");
  assert.equal(out.theme.dark, "endor-night");
});

test("make-layout warns about a bad config look instead of throwing", () => {
  const h = homes({ look: { terminal_opacity: 7 } });
  const r = build(h);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /terminal_opacity/);
  assert.equal(read(join(h.dir, "scruffy.json")).terminal_opacity, 0.45);
});

test("make-layout --view reads a layout file's view", () => {
  const h = homes();
  build(h);
  const f = join(h.dir, "scruffy.json");
  assert.equal(execFileSync("node", [MAKE, "--view", f], { encoding: "utf8" }).trim(), "focus");
  const t = read(f);
  node(t, "work-body").children[0] = { id: "kit-grid", type: "column", children: [] };
  writeFileSync(f, JSON.stringify(t));
  assert.equal(execFileSync("node", [MAKE, "--view", f], { encoding: "utf8" }).trim(), "grid");
  assert.equal(execFileSync("node", [MAKE, "--view", join(h.dir, "none.json")], { encoding: "utf8" }).trim(), "");
});

test("make-layout --pick and --list print for install.sh", () => {
  const run = (...a) => execFileSync("node", [MAKE, ...a], { encoding: "utf8" });
  assert.equal(run("--pick", "kamino-grid"), "kamino grid\n");
  assert.equal(run("--pick", "scruffy"), "");
  assert.equal(run("--pick", "main"), "tatooine focus\n");
  assert.equal(run("--list"), "scruffy\n");
  assert.equal(run("--legacy").trim().split(" ").length, 23, "20 scene layouts, kit, kit-grid and scruffyherdr");
  assert.equal(run("--old"), "scruffyherdr\n", "the layout's old name, for install.sh");
});

test("make-layout --from carries an old layout's .state sizes on the first migration, read only", () => {
  const h = homes();
  const state = join(h.dir, ".state", "scarif.json");
  const text = JSON.stringify({ nodes: { rail: { size: { px: 300 } } }, theme: { light: "x", dark: "y" } });
  writeFileSync(state, text);
  const before = statSync(state).mtimeMs;
  const r = build(h, "--scene", "scarif", "--from", "scarif");
  assert.equal(r.status, 0, r.stderr);
  const out = read(join(h.dir, "scruffy.json"));
  assert.deepEqual(node(out, "rail").size, { px: 300 });
  assert.equal(out.theme.dark, "scarif-night");
  assert.equal(readFileSync(state, "utf8"), text);
  assert.equal(statSync(state).mtimeMs, before);
});

test("make-layout --from: an existing scruffy.json wins, and a grid source keeps its rail to itself", () => {
  const h = homes();
  writeFileSync(join(h.dir, ".state", "naboo-grid.json"), JSON.stringify({ nodes: { rail: { size: { px: 410 } }, sidebar: { size: { px: 250 } }, "tile-x": { size: { px: 9 } } } }));
  build(h, "--scene", "naboo", "--from", "naboo-grid");
  let out = read(join(h.dir, "scruffy.json"));
  assert.deepEqual(node(out, "sidebar").size, { px: 250 });
  assert.deepEqual(node(out, "rail").size, { px: 260 });
  assert.equal(node(out, "tile-x"), null);
  writeFileSync(join(h.dir, ".state", "endor.json"), JSON.stringify({ nodes: { sidebar: { size: { px: 111 } } } }));
  build(h, "--scene", "endor", "--from", "endor");
  out = read(join(h.dir, "scruffy.json"));
  assert.deepEqual(node(out, "sidebar").size, { px: 250 }, "not the first migration: the kit file's sizes stay");
  const bad = build(h, "--from", "../../etc");
  assert.equal(bad.status, 0);
  assert.match(bad.stderr, /--from/);
});

test("make-layout: a reinstall from the grid takes the focus rail from sizes.json", () => {
  const h = homes();
  build(h, "--scene", "endor");
  const f = join(h.dir, "scruffy.json");
  const t = read(f);
  node(t, "work-body").children[0] = { id: "kit-grid", type: "column", children: [] };
  node(t, "rail").size = { px: 400 };
  writeFileSync(f, JSON.stringify(t));
  const sizes = join(h.kit, "sizes.json");
  const text = JSON.stringify({ focus: { rail: { size: { px: 333 } }, sidebar: { size: { px: 180 } } }, grid: { rail: { size: { px: 400 } } } });
  writeFileSync(sizes, text);
  build(h);
  const out = read(f);
  assert.deepEqual(node(out, "rail").size, { px: 333 });
  assert.deepEqual(node(out, "sidebar").size, { px: 200 }, "the grid file's shared sizes are fresher than sizes.json");
  assert.equal(readFileSync(sizes, "utf8"), text, "sizes.json is only read");
});

test("make-layout: sizes.json sits beneath a focus file's own sizes", () => {
  const h = homes();
  build(h);
  const f = join(h.dir, "scruffy.json");
  const t = read(f);
  node(t, "rail").size = { px: 280 };
  writeFileSync(f, JSON.stringify(t));
  writeFileSync(join(h.kit, "sizes.json"), JSON.stringify({ focus: { rail: { size: { px: 333 } } } }));
  build(h);
  assert.deepEqual(node(read(f), "rail").size, { px: 280 });
  writeFileSync(join(h.kit, "sizes.json"), "{");
  assert.equal(build(h).status, 0, "a malformed sizes.json is ignored");
});

test("make-layout --from <scene>-grid reads the focus sizes from the sibling <scene>.json and its .state", () => {
  const h = homes();
  const sib = JSON.parse(JSON.stringify(MAIN));
  node(sib, "sidebar").size = { px: 210 };
  sib.children[1].children[1].children.push({ id: "rail", type: "block", size: { px: 300 }, content: { mod: "kit-rail" } });
  writeFileSync(join(h.dir, "endor.json"), JSON.stringify(sib));
  writeFileSync(join(h.dir, ".state", "endor.json"), JSON.stringify({ nodes: { sidebar: { size: { px: 222 } } } }));
  writeFileSync(join(h.dir, "endor-grid.json"), JSON.stringify({ id: "root", type: "row", children: [{ id: "rail", type: "block", size: { px: 410 } }, { id: "kit-grid", type: "column", children: [] }] }));
  const r = build(h, "--scene", "endor", "--from", "endor-grid");
  assert.equal(r.status, 0, r.stderr);
  const out = read(join(h.dir, "scruffy.json"));
  assert.deepEqual(node(out, "rail").size, { px: 300 });
  assert.deepEqual(node(out, "sidebar").size, { px: 222 });
});

import { unlinkSync } from "node:fs";

test("make-layout --pick scruffyherdr reads the old file", () => {
  const h = homes();
  const old = join(h.dir, "scruffyherdr.json");
  writeFileSync(old, JSON.stringify({ id: "root", theme: { light: "kamino-day", dark: "kamino-night" }, children: [{ id: "kit-grid", type: "column", children: [] }] }));
  assert.equal(execFileSync("node", [MAKE, "--pick", "scruffyherdr", "", old], { encoding: "utf8" }), "kamino grid\n");
  assert.equal(execFileSync("node", [MAKE, "--pick", "scruffyherdr", "", join(h.dir, "nope.json")], { encoding: "utf8" }), "");
});

test("make-layout --from scruffyherdr: the old file is the existing file, its scene and sizes carry", () => {
  const h = homes();
  build(h, "--scene", "kamino");
  const fresh = read(join(h.dir, "scruffy.json"));
  node(fresh, "rail").size = { px: 300 };
  writeFileSync(join(h.dir, "scruffyherdr.json"), JSON.stringify(fresh));
  writeFileSync(join(h.dir, ".state", "scruffyherdr.json"), JSON.stringify({ nodes: { sidebar: { size: { px: 240 } } } }));
  unlinkSync(join(h.dir, "scruffy.json"));
  const r = build(h, "--from", "scruffyherdr");
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /--from/);
  const out = read(join(h.dir, "scruffy.json"));
  assert.equal(out.theme.dark, "kamino-night");
  assert.deepEqual(node(out, "rail").size, { px: 300 });
  assert.deepEqual(node(out, "sidebar").size, { px: 240 });
  assert.ok(existsSync(join(h.dir, "scruffyherdr.json")), "make-layout leaves the old file to install");
});

test("make-layout: with no scruffy.json, an old scruffyherdr.json stands in even without --from", () => {
  const h = homes();
  build(h, "--scene", "endor");
  const t = read(join(h.dir, "scruffy.json"));
  node(t, "rail").size = { px: 310 };
  writeFileSync(join(h.dir, "scruffyherdr.json"), JSON.stringify(t));
  unlinkSync(join(h.dir, "scruffy.json"));
  build(h);
  const out = read(join(h.dir, "scruffy.json"));
  assert.equal(out.theme.dark, "endor-night");
  assert.deepEqual(node(out, "rail").size, { px: 310 });
});

test("make-layout --from scruffyherdr in the grid keeps the grid's rail to itself", () => {
  const h = homes();
  build(h, "--scene", "kamino");
  const t = read(join(h.dir, "scruffy.json"));
  node(t, "work-body").children[0] = { id: "kit-grid", type: "column", children: [] };
  node(t, "rail").size = { px: 410 };
  writeFileSync(join(h.dir, "scruffyherdr.json"), JSON.stringify(t));
  unlinkSync(join(h.dir, "scruffy.json"));
  writeFileSync(join(h.kit, "sizes.json"), JSON.stringify({ focus: { rail: { size: { px: 300 } } }, grid: { rail: { size: { px: 410 } } } }));
  build(h, "--from", "scruffyherdr");
  const out = read(join(h.dir, "scruffy.json"));
  assert.equal(out.theme.dark, "kamino-night");
  assert.deepEqual(node(out, "rail").size, { px: 300 }, "the focus rail from sizes.json");
  assert.equal(node(out, "kit-grid"), null, "built in focus");
});
