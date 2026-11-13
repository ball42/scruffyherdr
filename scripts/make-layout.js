#!/usr/bin/env node
// Builds the one kit layout, scruffy.json: Herdr's shipped main layout
// with the herdr-signals strip beside the bottom status bar and herdr-kit's
// focus view, dressed dark as a scene (dress.js). herdr-signals swaps it to
// the grid and back, and to other scenes, in place. Shipped layouts reject
// structural edits, so the strip needs a personal layout; generating it keeps
// upstream changes. The undressed focus tree goes to layout-focus.json beside
// the config, for herdr-signals to go back to focus from the grid.
//   node scripts/make-layout.js <main.json> <layouts dir> [herdr-kit config.json] [--scene <key>] [--from <old layout>]
//   node scripts/make-layout.js --pick <shown layout> [theme pick] [old layout.json]   prints "<scene> <view>"
//   node scripts/make-layout.js --view <layout.json>                 prints "focus", "grid" or nothing
//   node scripts/make-layout.js --list | --legacy | --old
//   node scripts/make-layout.js --gallery | --gallery-keys   prints the gallery's herdr/layouts/scruffy.json
//                                                            or herdr/keys.json (tests/gallery.test.js)
// The scene: --scene, else the existing scruffy.json's, else the default.
// Panel sizes carry over from the existing file and its .state (read only);
// on the first migration (no scruffy.json yet), from --from's old layout
// file and its .state instead. Until scruffy.json exists, the layout's old
// name's file (scruffyherdr.json, OLD_KIT_LAYOUT) and its .state stand in as
// the existing file, with or without --from scruffyherdr.
// The config's optional "look" key overrides the defaults in herdr-signals/dress.js.
// Its optional "addons" list names add-on mods (docs/addons.md): each one
// present under <layouts dir>/../mods gets a 0-px block beside the strip.
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SCENE, KIT_LAYOUT, LEGACY_LAYOUTS, OLD_KIT_LAYOUT, SCENES, isGridTree, kitLayouts, legacyView, sceneOfTree } from "../herdr/mods/herdr-signals/scenes.js";
import { dress, validLook } from "../herdr/mods/herdr-signals/dress.js";
import { readClicks } from "../herdr/mods/herdr-signals/clicks.js";
import { readSizes } from "../herdr/mods/herdr-signals/sizes.js";
import { canonical, layoutChanged } from "../herdr/mods/herdr-signals/layout.js";
import { addonBlocks, withAddons } from "../herdr/mods/herdr-signals/addons.js";
import { kitKeys } from "./merge-config.js";

const SIGNALS = { id: "signals", type: "block", size: { px: 300 }, content: { mod: "herdr-signals" } };

function find(node, id) {
  if (node.id === id) return node;
  for (const c of node.children ?? []) {
    const hit = find(c, id);
    if (hit) return hit;
  }
  return null;
}

/** Returns a copy of `layout` whose `status` block is a row: [status bar, signals]. */
export function withSignals(layout) {
  const out = structuredClone(layout);
  const status = find(out, "status");
  if (!status) throw new Error("layout has no node with id 'status'");
  if (status.type === "row") return out; // already converted
  const bar = { id: "status-bar", type: "block", content: status.content };
  for (const k of Object.keys(status)) if (!["id", "size"].includes(k)) delete status[k];
  status.type = "row";
  status.children = [bar, structuredClone(SIGNALS)];
  return out;
}

const RAIL = { id: "rail", type: "block", size: { px: 260 }, min: 200, max: 420, content: { mod: "kit-rail" } };

/**
 * Returns a copy of `layout` with herdr-kit's focus view: named tabs
 * (kit-tabs), pane headers with alerts (kit-pane), the urgency rail at the
 * right of work-body, and Herdr's own agents list hidden (the rail replaces it).
 */
export function withKitChrome(layout) {
  const out = structuredClone(layout);
  const body = find(out, "work-body");
  if (!body) throw new Error("layout has no node with id 'work-body'");
  if (!body.children.some((c) => c.id === "rail")) body.children.push(structuredClone(RAIL));
  const tabs = find(out, "tabs");
  if (tabs) tabs.content = { mod: "kit-tabs" };
  const header = find(out, "main")?.content?.pane?.header;
  if (header) header.content = { mod: "kit-pane" };
  const agents = find(out, "agents");
  if (agents) agents.hidden = true;
  const sidebar = find(out, "sidebar");
  if (sidebar) sidebar.size = { px: 200 };
  return out;
}

/**
 * "<scene> <view>" install lands on from the shown layout `shown`: an old
 * scene layout's own ("kamino-grid" gives "kamino grid"); from the older
 * "kit" layouts, the scene matching its theme pick; from the layout's old
 * name, the scene and view its tree `tree` holds ("" without one); "" for
 * the kit layout itself; the default scene in focus for any other layout.
 */
export function pickView(shown, themePick = "", tree = null) {
  if (shown === KIT_LAYOUT) return "";
  if (shown === OLD_KIT_LAYOUT) return isObj(tree) ? `${sceneOfTree(tree)} ${isGridTree(tree) ? "grid" : "focus"}` : "";
  const old = legacyView(shown);
  if (old) return `${old.scene} ${old.view}`;
  if (shown === "kit" || shown === "kit-grid") {
    // Any pick of a non-default scene's theme wins: the default's themes were the old kit's own.
    const picked = (s) => Object.values(SCENES[s].theme).some((t) => themePick.includes(t));
    const scene = Object.keys(SCENES).find((s) => s !== DEFAULT_SCENE && picked(s)) ?? DEFAULT_SCENE;
    return `${scene} ${shown === "kit-grid" ? "grid" : "focus"}`;
  }
  return `${DEFAULT_SCENE} focus`;
}

/** Where the main.json the kit layout was built from is kept: beside the herdr-kit config. */
export function sourcePath(cfg) {
  return join(dirname(cfg), "layout-source.json");
}

/** Where the undressed focus tree goes: beside the herdr-kit config (herdr-signals reads it there). */
export function focusPath(cfg) {
  return join(dirname(cfg), "layout-focus.json");
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Every node's `size`, by id, in `tree`; `skip` ids left out. */
function treeSizes(tree, skip = new Set()) {
  const out = {};
  const walk = (n) => {
    if (!isObj(n)) return;
    if (typeof n.id === "string" && isObj(n.size) && !skip.has(n.id)) out[n.id] = { size: n.size };
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(tree);
  return out;
}

/**
 * The clicks a rebuild keeps (node id -> fields for dress): sizes from the
 * existing kit layout `existing`, then Herdr's `.state` nodes over them. A
 * grid file's rail is the grid's own size (sizes are per shape), so it stays
 * out of the focus build. `grid` says the source was a grid shape (an old
 * `-grid` layout's .state, which has no tree here).
 */
export function carriedClicks(existing, stateText, grid = isGridTree(existing)) {
  const skip = new Set(grid ? ["rail"] : []);
  const out = treeSizes(existing, skip);
  for (const [id, v] of Object.entries(readClicks(stateText).nodes)) {
    if (skip.has(id)) continue;
    out[id] = { ...(out[id] ?? {}), ...v };
  }
  return out;
}

/** The click maps merged in order, later ones winning per field. */
export function mergeClicks(...layers) {
  const out = {};
  for (const l of layers) for (const [id, v] of Object.entries(isObj(l) ? l : {})) out[id] = { ...(out[id] ?? {}), ...v };
  return out;
}

/** Where herdr-signals keeps each view's sizes: beside the herdr-kit config. */
export function sizesPath(cfg) {
  return join(dirname(cfg), "sizes.json");
}

const readJson = (f) => {
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return null;
  }
};
const readText = (f) => {
  try {
    return readFileSync(f, "utf8");
  } catch {
    return null;
  }
};

// realpath: a repo reached through a symlink (/var -> /private/var) must still run.
const MAIN_SCRIPT = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
const OPS = ["--changed", "--pick", "--list", "--legacy", "--old", "--view", "--gallery", "--gallery-keys"];

// The tested Herdr's main layout, which the gallery copy is built from.
const GALLERY_MAIN = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures", "herdr-0.1.15-main.json");

/**
 * The gallery's one build (herdr/layouts/scruffy.json): `main` with the strip
 * and the focus view, dressed dark as the default scene, with the default
 * look, no add-ons and no carried sizes.
 */
export function galleryLayout(main) {
  return dress(withKitChrome(withSignals(main)), { scene: DEFAULT_SCENE, light: false, look: validLook(undefined).look, clicks: {} });
}

if (MAIN_SCRIPT && process.argv[2] === "--gallery") {
  process.stdout.write(JSON.stringify(galleryLayout(JSON.parse(readFileSync(GALLERY_MAIN, "utf8"))), null, 2) + "\n");
}
if (MAIN_SCRIPT && process.argv[2] === "--gallery-keys") process.stdout.write(JSON.stringify(kitKeys(), null, 2) + "\n");

// make-layout.js --changed <main.json> <layout-source.json>: exit 1 when Herdr's
// main layout no longer matches what the kit layout was built from (install.sh --check).
if (MAIN_SCRIPT && process.argv[2] === "--changed") {
  const read = (f) => (f && existsSync(f) ? readFileSync(f, "utf8") : null);
  process.exit(layoutChanged(read(process.argv[3]), read(process.argv[4])) ? 1 : 0);
}

// --list: the kit layout names (install.sh's KIT_LAYOUTS); --legacy: the old ones install removes.
if (MAIN_SCRIPT && process.argv[2] === "--list") console.log(kitLayouts().join(" "));
if (MAIN_SCRIPT && process.argv[2] === "--legacy") console.log(LEGACY_LAYOUTS.join(" "));
// --old: the one layout's old name (install.sh's OLD_KIT_LAYOUT), whose .state goes with its file.
if (MAIN_SCRIPT && process.argv[2] === "--old") console.log(OLD_KIT_LAYOUT);

if (MAIN_SCRIPT && process.argv[2] === "--pick") {
  const out = pickView(process.argv[3] ?? "", process.argv[4] ?? "", process.argv[5] ? readJson(process.argv[5]) : null);
  if (out) console.log(out);
}

// --view <layout.json>: the view a kit layout file holds; nothing for a missing or malformed file.
if (MAIN_SCRIPT && process.argv[2] === "--view") {
  const tree = readJson(process.argv[3] ?? "");
  if (isObj(tree)) console.log(isGridTree(tree) ? "grid" : "focus");
}

if (MAIN_SCRIPT && !OPS.includes(process.argv[2])) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const at = args.indexOf(name);
    return at >= 0 ? args.splice(at, 2)[1] ?? null : null;
  };
  let want = flag("--scene");
  let from = flag("--from");
  if (from !== null && !LEGACY_LAYOUTS.includes(from)) {
    console.error(`warning: --from ${JSON.stringify(from)} isn't an old kit layout; ignored`);
    from = null;
  }
  const [src, dir, cfg] = args;
  if (!src || !dir) {
    console.error("usage: make-layout.js <main.json> <layouts dir> [config.json] [--scene <key>]");
    process.exit(2);
  }
  const config = cfg && existsSync(cfg) ? readJson(cfg) : null;
  if (cfg && existsSync(cfg) && !isObj(config)) console.error(`warning: ${cfg} isn't valid JSON; building with the default look`);
  const { look, problems } = validLook(isObj(config) ? config.look : undefined);
  for (const p of problems) console.error(`warning: ${p}`);
  const main = JSON.parse(readFileSync(src, "utf8"));
  let base = withSignals(main);
  try {
    base = withKitChrome(base);
  } catch (e) {
    console.error(`skipped the focus view (${e.message}); Herdr's main layout changed shape`);
  }
  // A listed add-on missing from mods/ is skipped: the layout still builds.
  let present = [];
  try {
    present = readdirSync(join(dir, "..", "mods"));
  } catch {
    present = [];
  }
  base = withAddons(base, addonBlocks(isObj(config) ? config.addons : undefined, present));
  const dst = join(dir, `${KIT_LAYOUT}.json`);
  // The kit file, else (no scruffy.json yet, and no older layout named by --from) its old name's.
  let existing = readJson(dst);
  let existingName = KIT_LAYOUT;
  if (!isObj(existing) && (from === null || from === OLD_KIT_LAYOUT)) {
    const prev = readJson(join(dir, `${OLD_KIT_LAYOUT}.json`));
    if (isObj(prev)) {
      existing = prev;
      existingName = OLD_KIT_LAYOUT;
    }
  }
  if (want !== null && !Object.prototype.hasOwnProperty.call(SCENES, want)) {
    console.error(`warning: unknown scene ${JSON.stringify(want)}; keeping the layout's own`);
    want = null;
  }
  const scene = want ?? (isObj(existing) ? sceneOfTree(existing) : DEFAULT_SCENE);
  // Herdr's own click record; read, never written (Herdr owns layouts/.state).
  // Sizes, freshest last: herdr-signals' saved focus sizes (sizes.json), then
  // the kit file and its .state; on a first migration (no kit file yet), the
  // old layout's instead, with a -grid one's focus sibling beneath it. Every
  // source is only read; layouts/.state belongs to Herdr.
  const saved = cfg ? readSizes(readText(sizesPath(cfg))).focus : {};
  const fileClicks = (name, grid) => {
    const tree = readJson(join(dir, `${name}.json`));
    return carriedClicks(isObj(tree) ? tree : null, readText(join(dir, ".state", `${name}.json`)), grid);
  };
  let clicks;
  if (isObj(existing) || from === null) {
    clicks = mergeClicks(saved, carriedClicks(isObj(existing) ? existing : null, readText(join(dir, ".state", `${existingName}.json`))));
  } else {
    // Part 1 wrote kept clicks into the old files, and layout.set deletes .state, so read both.
    const old = legacyView(from);
    const grid = from === "kit-grid" || old?.view === "grid";
    const sibling = from === "kit-grid" ? "kit" : grid ? old.scene : null;
    clicks = mergeClicks(saved, sibling ? fileClicks(sibling, false) : {}, fileClicks(from, grid));
  }
  writeFileSync(dst, JSON.stringify(dress(base, { scene, light: false, look, clicks }), null, 2) + "\n");
  console.log(`wrote ${dst} (${SCENES[scene].label})`);
  if (cfg) {
    // herdr-signals goes back to focus from this, and compares main.json with the source to say when it's out of date.
    writeFileSync(focusPath(cfg), JSON.stringify(base, null, 2) + "\n");
    writeFileSync(sourcePath(cfg), canonical(main) + "\n");
  }
}
