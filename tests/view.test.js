import { test } from "node:test";
import assert from "node:assert/strict";
import { afterStep, findNode, readTree, switchClicks, toggleWant, treeClicks, viewTree, wantStep } from "../herdr/mods/herdr-signals/view.js";
import { gridLayout, gridSpec } from "../herdr/mods/herdr-signals/grid.js";
import { KIT_LAYOUT, isGridTree } from "../herdr/mods/herdr-signals/scenes.js";

const NABOO = { light: "naboo-day", dark: "naboo-night" };
const onKit = (extra = {}) => ({ shown: KIT_LAYOUT, scene: "naboo", view: "focus", fileTheme: NABOO, ...extra });

const ag = (address, kind = null) => ({
  address, tab: `tab-${address}`, space: "s1", space_name: "P", name: `n-${address}`, hint: null,
  status: kind ?? "working", attention: { kind, since: kind ? 1 : null, pulse: kind === "blocked" },
});
const focusTree = () => ({
  id: "root", type: "row", children: [
    { id: "sidebar", type: "block", size: { px: 220 } },
    { id: "work-body", type: "row", children: [
      { id: "main", type: "block", size: { weight: 1 }, content: { tab: "active", pane: { background: "background" } } },
      { id: "rail", type: "block", size: { px: 300 }, content: { mod: "kit-rail" } },
    ] },
    { id: "panel", type: "column", hidden: true, children: [{ id: "panel-body", type: "block" }] },
  ],
});
const spec = (n = 2) => gridSpec(Array.from({ length: n }, (_, i) => ag(`t${i}`)), "s1");
const find = (n, id) => (n.id === id ? n : (n.children ?? []).map((c) => find(c, id)).find(Boolean) ?? null);
const MAIN_NODE = { id: "main", type: "block", content: { tab: "active", pane: { gap: 8, lone: true } } };

test("wantStep: a viewWant beats the theme-list follow", () => {
  const s = wantStep(onKit({ viewWant: "grid", stateTheme: { light: "naboo-day", dark: "endor-night" } }));
  assert.equal(s.view, "grid");
  assert.equal(s.follow, false);
  assert.equal(s.switchTo, null);
  assert.equal(s.scene, "naboo");
});

test("wantStep: the latest viewWant wins (grid, then focus before a write)", () => {
  assert.equal(wantStep(onKit({ viewWant: "grid" })).view, "grid");
  const s = wantStep(onKit({ viewWant: "focus" }));
  assert.equal(s.view, "focus");
  assert.equal(s.follow, false);
});

test("wantStep: a sceneWant off the kit layout switches to it in focus", () => {
  const s = wantStep({ shown: "main", scene: null, view: null, sceneWant: "endor", viewWant: null, stateTheme: null, fileTheme: null });
  assert.deepEqual(s, { switchTo: "scruffy", scene: "endor", look: null, view: "focus", follow: false });
});

test("wantStep: a viewWant off the kit layout changes nothing", () => {
  const s = wantStep({ shown: "main", scene: null, look: null, view: null, sceneWant: null, viewWant: "grid", stateTheme: null, fileTheme: null });
  assert.deepEqual(s, { switchTo: null, scene: null, look: null, view: null, follow: false });
});

test("wantStep: with no wants, a theme-list pick asks to follow", () => {
  const s = wantStep(onKit({ stateTheme: { light: "naboo-day", dark: "endor-night" } }));
  assert.equal(s.follow, true);
  assert.equal(s.view, "focus");
  assert.equal(s.scene, "naboo");
});

test("wantStep: no pick, or the file's own pair, gives no follow", () => {
  assert.equal(wantStep(onKit()).follow, false);
  assert.equal(wantStep(onKit({ stateTheme: { ...NABOO } })).follow, false);
});

test("wantStep: a sceneWant on the kit layout keeps the view and waits the follow", () => {
  const s = wantStep(onKit({ view: "grid", sceneWant: "endor", stateTheme: { light: "naboo-day", dark: "hoth-night" } }));
  assert.deepEqual(s, { switchTo: null, scene: "endor", look: null, view: "grid", follow: false });
});

test("wantStep: unknown wants are ignored", () => {
  const s = wantStep(onKit({ sceneWant: "alderaan", viewWant: "sideways" }));
  assert.deepEqual(s, { switchTo: null, scene: "naboo", look: null, view: "focus", follow: false });
  assert.equal(wantStep(onKit({ sceneWant: "__proto__" })).scene, "naboo");
});

test("toggleWant: flips the pending want first, then the shown view; nothing off the kit layout", () => {
  assert.equal(toggleWant("focus", null), "grid");
  assert.equal(toggleWant("grid", null), "focus");
  assert.equal(toggleWant("focus", "grid"), "focus", "a second press before the write lands goes back");
  assert.equal(toggleWant(null, null), null);
});

test("viewTree: grid gives a grid tree", () => {
  const out = viewTree({ view: "grid", shown: focusTree(), focus: focusTree(), gridSpec: spec() });
  assert.equal(isGridTree(out), true);
});

test("viewTree: focus with a focus tree returns that tree", () => {
  const f = focusTree();
  const shown = gridLayout(focusTree(), spec());
  assert.deepEqual(viewTree({ view: "focus", shown, focus: f, gridSpec: null }), f);
});

test("viewTree: focus with no focus tree puts main back from Herdr's main node", () => {
  const shown = gridLayout(focusTree(), spec(3));
  const out = viewTree({ view: "focus", shown, focus: null, gridSpec: null, main: MAIN_NODE });
  assert.equal(isGridTree(out), false);
  const main = find(out, "main");
  assert.ok(main);
  assert.equal(main.type, "block");
  assert.deepEqual(main.content, MAIN_NODE.content);
  assert.deepEqual(main.size, { weight: 1 }, "main keeps its size");
  assert.ok(find(out, "rail"), "the chrome stays");
});

test("viewTree: a folded grid (no main) gets main back in the grid's place", () => {
  const folded = {
    id: "root", type: "row", children: [
      { id: "work-body", type: "row", children: [
        { id: "grid-row-0", type: "row", children: [{ id: "tile-t0", type: "column", children: [] }] },
        { id: "rail", type: "block" },
      ] },
    ],
  };
  const out = viewTree({ view: "focus", shown: folded, focus: null, gridSpec: null, main: MAIN_NODE });
  assert.equal(isGridTree(out), false);
  assert.equal(out.children[0].children[0].id, "main");
  assert.equal(out.children[0].children[1].id, "rail");
});

test("viewTree: focus with no focus tree, from focus, returns the shown tree", () => {
  const f = focusTree();
  assert.deepEqual(viewTree({ view: "focus", shown: f, focus: null, gridSpec: null }), f);
});

test("viewTree: focus with no focus tree and no main node keeps the shown grid, never throws", () => {
  const shown = gridLayout(focusTree(), spec());
  assert.deepEqual(viewTree({ view: "focus", shown, focus: null, gridSpec: null, main: null }), shown);
  assert.deepEqual(viewTree({ view: "focus", shown: null, focus: null, gridSpec: null }), null);
});

test("viewTree: never changes its inputs", () => {
  const shown = gridLayout(focusTree(), spec());
  const before = JSON.stringify(shown);
  viewTree({ view: "focus", shown, focus: null, gridSpec: null, main: MAIN_NODE });
  assert.equal(JSON.stringify(shown), before);
});

test("treeClicks: sizes and hidden flags from the tree, by id", () => {
  assert.deepEqual(treeClicks(focusTree()), {
    sidebar: { size: { px: 220 } },
    main: { size: { weight: 1 } },
    rail: { size: { px: 300 } },
    panel: { hidden: true },
  });
});

test("switchClicks: focus to grid keeps the focus rail aside and carries shared nodes", () => {
  const shown = focusTree();
  const target = gridLayout(shown, spec());
  const state = { sidebar: { size: { px: 250 } }, rail: { size: { px: 336 } } };
  const { aside, carry } = switchClicks({ shown, state, target, aside: { focus: {}, grid: {} }, from: "focus", to: "grid" });
  assert.deepEqual(aside.focus.rail, { size: { px: 336 } }, "the rail's focus size is kept for the way back");
  assert.deepEqual(aside.focus.panel, { hidden: true }, "a node the grid lacks is kept aside");
  assert.equal(aside.focus.sidebar, undefined, "a node in both shapes isn't kept aside");
  assert.deepEqual(carry.sidebar, { size: { px: 250 } }, "the clicked sidebar size carries over");
  assert.equal(carry.rail, undefined, "the focus rail size doesn't reach the grid");
  assert.deepEqual(aside.grid, {});
});

test("switchClicks: back to focus brings the focus rail back and keeps the grid rail aside", () => {
  const focus = focusTree();
  const grid = gridLayout(focus, spec());
  find(grid, "rail").size = { px: 180 };
  find(grid, "tile-t0").size = { weight: 2 };
  const aside = { focus: { rail: { size: { px: 336 } }, panel: { hidden: true } }, grid: {} };
  const out = switchClicks({ shown: grid, state: { sidebar: { size: { px: 260 } } }, target: focus, aside, from: "grid", to: "focus" });
  assert.deepEqual(out.carry.rail, { size: { px: 336 } });
  assert.deepEqual(out.carry.panel, { hidden: true });
  assert.deepEqual(out.carry.sidebar, { size: { px: 260 } });
  assert.deepEqual(out.aside.grid.rail, { size: { px: 180 } });
  assert.deepEqual(out.aside.grid["tile-t0"], { size: { weight: 2 } }, "tile sizes wait for the grid's return");
  assert.deepEqual(out.aside.focus, {}, "the focus clicks are used up");
  assert.deepEqual(aside.focus.rail, { size: { px: 336 } }, "inputs are not changed");
});

test("switchClicks: fresh .state clicks beat the tree's values", () => {
  const shown = focusTree();
  const target = gridLayout(shown, spec());
  const { aside } = switchClicks({ shown, state: { rail: { size: { px: 400 } } }, target, aside: null, from: "focus", to: "grid" });
  assert.deepEqual(aside.focus.rail, { size: { px: 400 } });
});

test("afterStep: runs once the view is shown, waits while a view is pending, drops a stale one", () => {
  const after = { view: "focus", address: "t1" };
  assert.equal(afterStep(after, "focus", false), "run");
  assert.equal(afterStep(after, "grid", true), "wait");
  assert.equal(afterStep(after, "grid", false), "drop");
  assert.equal(afterStep(after, null, false), "drop", "off the kit layout");
  assert.equal(afterStep(null, "focus", false), null);
  assert.equal(afterStep({ view: "focus" }, "focus", false), "drop", "no address");
});

test("readTree: a tree from text; null for missing, junk or a non-tree", () => {
  assert.deepEqual(readTree('{"id":"root","children":[]}'), { id: "root", children: [] });
  for (const t of [null, "", "{", "3", "[]", '{"children":[]}']) assert.equal(readTree(t), null, String(t));
});

test("findNode: by id anywhere, null when absent", () => {
  assert.equal(findNode(focusTree(), "rail").size.px, 300);
  assert.equal(findNode(focusTree(), "nope"), null);
  assert.equal(findNode(null, "main"), null);
});

import { SWITCH_WAIT_MS, stepPlan, switchStep } from "../herdr/mods/herdr-signals/view.js";
import { dress } from "../herdr/mods/herdr-signals/dress.js";
import { sceneOfTree } from "../herdr/mods/herdr-signals/scenes.js";

test("switchStep: one layout.switch per scene request, then wait, then give up", () => {
  assert.equal(switchStep({ present: false, tried: null, want: "endor", now: 0 }), "missing");
  assert.equal(switchStep({ present: true, tried: null, want: "endor", now: 0 }), "switch");
  const tried = { want: "endor", at: 1000 };
  assert.equal(switchStep({ present: true, tried, want: "endor", now: 1500 }), "wait", "sent: don't send again");
  assert.equal(switchStep({ present: true, tried, want: "endor", now: 1000 + SWITCH_WAIT_MS + 1 }), "give-up");
  assert.equal(switchStep({ present: true, tried, want: "hoth", now: 1500 }), "switch", "a new request gets its own try");
});

// One pass as main.js runs it: wantStep on what's read, then stepPlan.
const pass = (shown, wants, extra = {}) => {
  const cur = { scene: sceneOfTree(shown), view: isGridTree(shown) ? "grid" : "focus" };
  const want = wantStep({ shown: KIT_LAYOUT, ...cur, ...wants, fileTheme: shown.theme });
  return stepPlan({ shown, cur, want, plan: want.view === "grid" ? { spec: { ...spec(), scene: want.scene }, sig: "s" } : null, focus: focusTree(), ...extra });
};
const dressed = (scene = "naboo") => dress(focusTree(), { scene });

test("stepPlan: a shown tree already dressed as its scene needs no write", () => {
  const p = pass(dressed(), {});
  assert.equal(p.write, null);
  assert.equal(p.skip, false);
});

test("stepPlan: the latest view request wins; two toggles before a write don't flap", () => {
  const shown = dressed();
  let want = toggleWant("focus", null); // first cmd-shift-g
  want = toggleWant("focus", want); // second, before a pass ran: setShared overwrote the first
  assert.equal(want, "focus");
  assert.equal(pass(shown, { viewWant: want }).write, null, "back where it started: nothing to write");
  const g = pass(shown, { viewWant: toggleWant("focus", null) });
  assert.equal(isGridTree(g.write), true);
});

test("stepPlan: order is wants, then the view's tree, then dress with the scene, then applyPlan", () => {
  const p = pass(dressed(), { viewWant: "grid", sceneWant: "endor" });
  assert.equal(isGridTree(p.write), true, "the view's tree");
  assert.equal(sceneOfTree(p.write), "endor", "dressed with the wanted scene");
  assert.equal(p.retiled, true);
  assert.equal(p.key, `${KIT_LAYOUT}|false|endor||grid|s`);
  assert.deepEqual(p.aside.grid, {});
});

test("stepPlan: the key that just failed is skipped; a dress error comes back, not thrown", () => {
  const first = pass(dressed(), { sceneWant: "endor" });
  assert.equal(pass(dressed(), { sceneWant: "endor" }, { failedKey: first.key }).skip, true);
  const bad = pass(dressed(), { sceneWant: "endor" }, { look: { terminal_opacity: 9 } });
  assert.match(bad.error.message, /terminal_opacity/);
  assert.equal(bad.write, null);
});

test("stepPlan: focus without a focus tree is a fallback the caller notes", () => {
  const shown = dress(gridLayout(focusTree(), spec()), { scene: "naboo" });
  const p = pass(shown, { viewWant: "focus" }, { focus: null, main: MAIN_NODE });
  assert.equal(p.fallback, true);
  assert.equal(isGridTree(p.write), false);
});

import { keepTheme, pickFollow } from "../herdr/mods/herdr-signals/view.js";

const MIX = { light: "naboo-day", dark: "endor-night" };

test("pickFollow: a scene's theme picked in Herdr's list names that scene", () => {
  assert.equal(pickFollow(NABOO, MIX, false), "endor:night");
});

test("pickFollow: a theme that names no scene is kept", () => {
  assert.equal(pickFollow(NABOO, { light: "naboo-day", dark: "github-dark-colorblind" }, false), "keep");
});

test("pickFollow: the file's own pair, or no pick, gives null", () => {
  assert.equal(pickFollow(NABOO, { ...NABOO }, false), null);
  assert.equal(pickFollow(NABOO, null, false), null);
  assert.equal(pickFollow(NABOO, undefined, true), null);
});

test("pickFollow: the half that differs from the file counts, the current one first", () => {
  assert.equal(pickFollow(NABOO, MIX, true), "endor:night", "picked in dark, polled after the swap to light");
  assert.equal(pickFollow(NABOO, { light: "hoth-day", dark: "naboo-night" }, true), "hoth:day");
  assert.equal(pickFollow(NABOO, { light: "hoth-day", dark: "endor-night" }, true), "hoth:day", "both differ: the current half");
  assert.equal(pickFollow(NABOO, { light: "github-light", dark: "naboo-night" }, false), "keep", "a light keep seen in dark");
});

test("pickFollow: re-picking a scene's own theme over a kept one resets to the scene", () => {
  const file = { light: "naboo-day", dark: "github-dark-colorblind" };
  assert.equal(pickFollow(file, { light: "naboo-day", dark: "naboo-night" }, false), "naboo:night");
});

test("keepTheme: a kept pick carries into the tree; nothing to keep gives null", () => {
  const pick = { light: "naboo-day", dark: "github-dark-colorblind" };
  assert.deepEqual(keepTheme({ fileTheme: NABOO, stateTheme: pick, scene: "naboo", light: false }), pick);
  assert.equal(keepTheme({ fileTheme: NABOO, stateTheme: null, scene: "naboo", light: false }), null);
  assert.equal(keepTheme({ fileTheme: NABOO, stateTheme: MIX, scene: "naboo", light: false }), null, "a scene pick is followed, not kept");
});

test("keepTheme: a pick already in the file survives later writes; a scene request drops it", () => {
  const file = { light: "naboo-day", dark: "github-dark-colorblind" };
  assert.deepEqual(keepTheme({ fileTheme: file, stateTheme: null, scene: "naboo", light: false }), file);
  assert.equal(keepTheme({ fileTheme: file, stateTheme: null, scene: "naboo", sceneWant: "hoth", light: false }), null);
});

test("stepPlan: a non-scene pick survives a write (view toggle) and the next quiet poll", () => {
  const pick = { light: "naboo-day", dark: "github-dark-colorblind" };
  const toGrid = pass(dressed(), { viewWant: "grid", stateTheme: pick }, { light: false, stateTheme: pick });
  assert.deepEqual(toGrid.next.theme, pick);
  const shown = toGrid.next; // the write deleted .state; the file now holds the pick
  assert.equal(sceneOfTree(shown), "naboo");
  const quiet = pass(shown, {}, { light: false });
  assert.equal(quiet.write, null, "no rewrite, no loop");
  const toFocus = pass(shown, { viewWant: "focus" }, { light: false });
  assert.deepEqual(toFocus.next.theme, pick);
});

test("stepPlan: a scene request replaces a kept pick", () => {
  const pick = { light: "naboo-day", dark: "github-dark-colorblind" };
  const shown = { ...dressed(), theme: pick };
  const p = pass(shown, { sceneWant: "hoth" }, { light: false, sceneWant: "hoth" });
  assert.deepEqual(p.next.theme, { light: "hoth-day", dark: "hoth-night" });
});

test("pickFollow / keepTheme: malformed or partial .state themes never throw", () => {
  for (const bad of [{}, { light: 3, dark: null }, { dark: "github-dark-colorblind" }, [], "x", 7]) {
    assert.doesNotThrow(() => pickFollow(NABOO, bad, false));
    assert.doesNotThrow(() => keepTheme({ fileTheme: NABOO, stateTheme: bad, scene: "naboo", light: false }));
  }
  assert.equal(pickFollow(NABOO, { light: "naboo-day" }, false), null, "missing half");
  assert.equal(pickFollow(null, { light: "a", dark: "endor-night" }, false), "endor:night", "no file theme");
  assert.deepEqual(keepTheme({ fileTheme: NABOO, stateTheme: { dark: "github-dark-colorblind" }, scene: "naboo", light: false }), { light: "naboo-day", dark: "github-dark-colorblind" });
});

test("keepTheme: a light-appearance keep holds the light half", () => {
  const pick = { light: "github-light", dark: "naboo-night" };
  assert.equal(pickFollow(NABOO, pick, true), "keep");
  assert.deepEqual(keepTheme({ fileTheme: NABOO, stateTheme: pick, scene: "naboo", light: true }), pick);
});

test("stepPlan: a same-scene request over a kept pick restores the scene pair", () => {
  const shown = { ...dressed(), theme: { light: "naboo-day", dark: "github-dark-colorblind" } };
  const p = pass(shown, { sceneWant: "naboo" }, { light: false, sceneWant: "naboo" });
  assert.deepEqual(p.next.theme, NABOO);
});

test("stepPlan: the night/day picture swap carries a kept pick", () => {
  const pick = { light: "naboo-day", dark: "github-dark-colorblind" };
  const shown = { ...dressed(), theme: pick };
  const day = pass(shown, {}, { light: true });
  assert.notEqual(day.write, null, "the picture swaps");
  assert.notEqual(day.next.background?.image, shown.background?.image);
  assert.deepEqual(day.next.theme, pick);
});

import { recordTheme } from "../herdr/mods/herdr-signals/view.js";

const KAMINO = { light: "kamino-day", dark: "kamino-night" };

test("recordTheme: layout() with a pick merged in is not the file; the written pair is", () => {
  const stateTheme = { light: "kamino-day", dark: "endor-night" };
  const shown = { theme: stateTheme };
  const file = recordTheme({ written: KAMINO, shown, stateTheme });
  assert.deepEqual(file, KAMINO);
  assert.equal(pickFollow(file, stateTheme, false), "endor:night", "a scene pick is followed");
});

test("recordTheme: a merged non-scene pick is written once, then quiet", () => {
  const stateTheme = { light: "kamino-day", dark: "github-dark-colorblind" };
  const shown = { ...dress(focusTree(), { scene: "kamino" }), theme: stateTheme };
  const file = recordTheme({ written: KAMINO, shown, stateTheme });
  assert.equal(pickFollow(file, stateTheme, false), "keep");
  const cur = { scene: sceneOfTree({ theme: file }), view: "focus" };
  const want = wantStep({ shown: KIT_LAYOUT, ...cur, stateTheme, fileTheme: file });
  const p = stepPlan({ shown, cur, want, light: false, stateTheme, fileTheme: file });
  assert.deepEqual(p.write?.theme, stateTheme, "carried into the file before .state is lost");
  // After the write .state is gone and the tree is the file.
  const after = recordTheme({ written: p.next.theme, shown: p.write, stateTheme: null });
  const cur2 = { scene: sceneOfTree({ theme: after }), view: "focus" };
  const want2 = wantStep({ shown: KIT_LAYOUT, ...cur2, fileTheme: after });
  assert.equal(stepPlan({ shown: p.write, cur: cur2, want: want2, light: false, fileTheme: after }).write, null, "no loop");
});

test("recordTheme: no pick means the tree is the file (an install rewrote it)", () => {
  assert.deepEqual(recordTheme({ written: KAMINO, shown: { theme: NABOO }, stateTheme: null }), NABOO);
});

test("recordTheme: seeds from the file text, then the scene's own pair", () => {
  const stateTheme = { light: "kamino-day", dark: "endor-night" };
  const shown = { theme: stateTheme };
  assert.deepEqual(recordTheme({ fileText: JSON.stringify({ theme: KAMINO }), shown, stateTheme }), KAMINO);
  for (const bad of ["{oops", "null", "[]", JSON.stringify({ theme: { light: 1 } }), null]) {
    assert.deepEqual(recordTheme({ fileText: bad, shown, stateTheme, scene: "hoth" }), { light: "hoth-day", dark: "hoth-night" });
  }
  assert.deepEqual(recordTheme({ fileText: "{oops", shown: { theme: null }, stateTheme, scene: "hoth" }), { light: "hoth-day", dark: "hoth-night" });
});

// layout() merges a .state pick into its tree, so `shown` carries the pick while
// the file still holds `fileTheme`; the write must be judged against the file.
const merged = (theme) => ({ ...dressed(), theme });
const GH = { light: "naboo-day", dark: "github-dark-colorblind" };

test("stepPlan: a kept pick seen only through layout() is written to the file", () => {
  const p = pass(merged(GH), {}, { light: false, stateTheme: GH, fileTheme: NABOO });
  assert.notEqual(p.write, null, "else .state alone holds it and the next write wipes it");
  assert.deepEqual(p.write.theme, GH);
});

test("stepPlan: re-picking the scene's own theme over a kept one is written", () => {
  assert.equal(pickFollow(GH, NABOO, false), "naboo:night");
  const p = pass(merged(NABOO), { sceneWant: "naboo" }, { light: false, stateTheme: NABOO, fileTheme: GH, sceneWant: "naboo" });
  assert.notEqual(p.write, null, "else the follow asks again every poll");
  assert.deepEqual(p.write.theme, NABOO);
});

test("stepPlan: keep, day swap, grid toggle, re-pick, in order", () => {
  const keep = pass(merged(GH), {}, { light: false, stateTheme: GH, fileTheme: NABOO });
  let file = keep.write; // .state is gone now
  const day = pass(file, {}, { light: true, fileTheme: file.theme });
  assert.deepEqual(day.next.theme, GH, "the day swap keeps it");
  file = day.write ?? file;
  const grid = pass(file, { viewWant: "grid" }, { light: true, fileTheme: file.theme });
  assert.deepEqual(grid.next.theme, GH, "the grid toggle keeps it");
  file = grid.write;
  const re = pass({ ...file, theme: NABOO }, { sceneWant: "naboo" }, { light: false, stateTheme: NABOO, fileTheme: GH, sceneWant: "naboo" });
  assert.deepEqual(re.write?.theme, NABOO, "a re-pick resets to the scene");
});

import { parseWant, pinFor, pinOf } from "../herdr/mods/herdr-signals/view.js";

// A scene can be pinned to its night or day look whatever the appearance:
// both halves of the layout's pair are then that one theme.
const DAY = { light: "naboo-day", dark: "naboo-day" };

test("parseWant: a scene key, with or without a look", () => {
  assert.deepEqual(parseWant("endor"), { scene: "endor", look: null });
  assert.deepEqual(parseWant("endor:day"), { scene: "endor", look: "day" });
  assert.deepEqual(parseWant("endor:night"), { scene: "endor", look: "night" });
  for (const bad of [null, "", "nope", "nope:day", "endor:noon", "__proto__", 3, {}]) assert.equal(parseWant(bad), null, String(bad));
});

test("pinOf: both halves one scene theme is a pin; anything else is not", () => {
  assert.equal(pinOf(DAY), "day");
  assert.equal(pinOf({ light: "endor-night", dark: "endor-night" }), "night");
  assert.equal(pinOf(NABOO), null);
  assert.equal(pinOf({ light: "github-light", dark: "github-light" }), null);
  assert.equal(pinOf(null), null);
});

test("pinFor: a look unlike the appearance pins; a look like it unpins; no look keeps the file's pin", () => {
  assert.equal(pinFor({ look: "day", light: false, fileTheme: NABOO }), "day");
  assert.equal(pinFor({ look: "night", light: true, fileTheme: NABOO }), "night");
  assert.equal(pinFor({ look: "night", light: false, fileTheme: DAY }), null);
  assert.equal(pinFor({ look: "day", light: true, fileTheme: DAY }), null);
  assert.equal(pinFor({ look: null, light: false, fileTheme: DAY }), "day");
  assert.equal(pinFor({ look: null, light: false, fileTheme: NABOO }), null);
});

test("pickFollow: a scene's day theme picked in dark asks for its day look", () => {
  assert.equal(pickFollow(NABOO, { light: "naboo-day", dark: "endor-day" }, false), "endor:day");
  assert.equal(pickFollow(DAY, { light: "naboo-day", dark: "naboo-night" }, false), "naboo:night", "unpins");
});

test("wantStep: a request with a look names its scene and look", () => {
  const w = wantStep({ shown: KIT_LAYOUT, scene: "naboo", view: "focus", sceneWant: "endor:day" });
  assert.equal(w.scene, "endor");
  assert.equal(w.look, "day");
  assert.equal(wantStep({ shown: "main", sceneWant: "endor:day" }).switchTo, KIT_LAYOUT);
});

test("stepPlan: a day pin writes the day theme in both halves and the day picture", () => {
  const p = pass(dressed(), { sceneWant: "endor:day" }, { light: true, pin: "day", sceneWant: "endor:day" });
  assert.deepEqual(p.write.theme, { light: "endor-day", dark: "endor-day" });
  assert.deepEqual(p.write.background, dress(focusTree(), { scene: "endor", light: true }).background);
});

test("stepPlan: a pin survives a grid toggle and a quiet poll, and a keep can't undo it", () => {
  const pinned = pass(dressed(), { sceneWant: "naboo:day" }, { light: true, pin: "day", sceneWant: "naboo:day" }).write;
  const quiet = pass(pinned, {}, { light: true, pin: "day", fileTheme: DAY });
  assert.equal(quiet.write, null, "no loop");
  const grid = pass(pinned, { viewWant: "grid" }, { light: true, pin: "day", fileTheme: DAY });
  assert.deepEqual(grid.next.theme, DAY);
});

test("stepPlan: unpinning goes back to the scene's own pair", () => {
  const p = pass({ ...dressed(), theme: DAY }, { sceneWant: "naboo:night" }, { light: false, pin: null, sceneWant: "naboo:night", fileTheme: DAY });
  assert.deepEqual(p.write.theme, NABOO);
});

import { NO_KIT_PROBLEM } from "../herdr/mods/herdr-signals/view.js";

test("on scruffyherdr (mods reloaded before ./install.sh), a scene request says to run install until scruffy exists", () => {
  const want = wantStep({ shown: "scruffyherdr", scene: null, view: null, sceneWant: "endor", viewWant: null, stateTheme: null, fileTheme: null });
  assert.equal(want.switchTo, "scruffy", "the old name is not the kit layout");
  assert.equal(switchStep({ present: ["main", "scruffyherdr"].includes(want.switchTo), tried: null, want: "endor", now: 0 }), "missing");
  assert.match(NO_KIT_PROBLEM, /no scruffy layout, run \.\/install\.sh/);
  assert.equal(switchStep({ present: ["main", "scruffyherdr", "scruffy"].includes(want.switchTo), tried: null, want: "endor", now: 0 }), "switch");
  assert.equal(wantStep({ shown: "scruffyherdr", scene: null, view: null, sceneWant: null, viewWant: "grid" }).switchTo, null, "a view request alone does nothing there");
});
