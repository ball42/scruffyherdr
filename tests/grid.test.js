import { test } from "node:test";
import assert from "node:assert/strict";
import { gridSpec, gridLayout, gridSignature, gridLeave, gridLanding, isLight } from "../herdr/mods/herdr-signals/grid.js";
import { isGridTree } from "../herdr/mods/herdr-signals/scenes.js";

const ag = (address, kind = null, extra = {}) => ({
  address, tab: `tab-${address}`, space: "s1", space_name: "P", name: `n-${address}`, hint: null,
  status: kind ?? "working", attention: { kind, since: kind ? 1 : null, pulse: kind === "blocked" }, ...extra,
});
const many = (n) => Array.from({ length: n }, (_, i) => ag(`t${i}`));

const base = {
  id: "root", type: "row", children: [
    { id: "work-body", type: "row", children: [
      { id: "main", type: "block", size: { fr: 1 }, content: { tab: "active", pane: { header: { content: { mod: "kit-pane" } } } } },
      { id: "rail", type: "block", content: { mod: "kit-rail" } },
    ] },
  ],
};
const main = (l) => l.children[0].children[0];
const kg = (l) => main(l);
const tiles = (l) => kg(l).children.filter((r) => r.type === "row").flatMap((r) => r.children);

test("one claude one column", () => {
  const s = gridSpec(many(1), "s1");
  assert.equal(s.cols, 1);
  assert.equal(s.tiles.length, 1);
  assert.deepEqual(s.chips, []);
});

test("four claudes two columns", () => {
  const s = gridSpec(many(4), "s1");
  assert.equal(s.cols, 2);
  const out = gridLayout(base, s);
  assert.equal(kg(out).children.length, 2);
  assert.equal(kg(out).children[0].children.length, 2);
});

test("five claudes three columns", () => {
  const s = gridSpec(many(5), "s1");
  assert.equal(s.cols, 3);
  assert.equal(s.tiles.length, 5);
});

test("twelve claudes: urgent tiles first, rest chips", () => {
  const as = [...many(10), ag("b", "blocked"), ag("d", "done")];
  const s = gridSpec(as, "s1");
  assert.equal(s.cols, 3);
  assert.equal(s.tiles.length, 9);
  assert.deepEqual(s.tiles.slice(0, 2).map((a) => a.address), ["b", "d"]);
  assert.equal(s.chips.length, 3);
  const out = gridLayout(base, s);
  const last = kg(out).children.at(-1);
  assert.deepEqual(last.content, { mod: "kit-rail", props: { compact: true } });
  assert.deepEqual(last.size, { px: 30 });
});

test("grid only current space", () => {
  const s = gridSpec([ag("a"), ag("o", "blocked", { space: "s2" })], "s1");
  assert.deepEqual(s.tiles.map((a) => a.address), ["a"]);
  assert.deepEqual(s.chips, []);
});

test("tile borders follow attention", () => {
  const out = gridLayout(base, gridSpec([ag("b", "blocked"), ag("d", "done"), ag("w")], "s1"));
  const [b, d, w] = tiles(out);
  assert.deepEqual(b.border, { width: 2, color: "#ec8e2c" });
  assert.deepEqual(d.border, { width: 1, color: "#58a6ff" });
  assert.deepEqual(w.border, { width: 1, color: "border" });
  assert.deepEqual(b.children[0], { id: "tile-b-head", type: "block", size: { px: 28 }, content: { mod: "kit-pane", props: "b" } });
  assert.deepEqual(b.children[1].content, { terminal: "b" });
});

test("empty grid shows placeholder", () => {
  const out = gridLayout(base, { cols: 1, tiles: [], chips: [] });
  assert.equal(kg(out).id, "kit-grid");
  assert.deepEqual(kg(out).content, { mod: "kit-rail" });
  assert.deepEqual(main(out).size, { fr: 1 });
  assert.equal(out.children[0].children[1].id, "rail");
});

test("signature changes only with tiles, kinds, cols or chips", () => {
  const a = gridSignature(gridSpec([ag("a"), ag("b")], "s1"));
  assert.equal(a, gridSignature(gridSpec([ag("a"), ag("b", null, { name: "renamed" })], "s1")));
  assert.notEqual(a, gridSignature(gridSpec([ag("a"), ag("b", "blocked")], "s1")));
});

test("gridLayout does not mutate base", () => {
  const before = JSON.stringify(base);
  gridLayout(base, gridSpec(many(3), "s1"));
  assert.equal(JSON.stringify(base), before);
});

test("tiles keep their places when attention changes", () => {
  const first = gridSpec([ag("w"), ag("b", "blocked")], "s1");
  assert.deepEqual(first.tiles.map((a) => a.address), ["b", "w"]);
  const prev = first.tiles.map((a) => a.address);
  // b answered (now working), w blocked: nobody moves, only borders change
  const next = gridSpec([ag("w", "blocked"), ag("b")], "s1", prev);
  assert.deepEqual(next.tiles.map((a) => a.address), ["b", "w"]);
  // a newcomer goes after the existing tiles; a gone one leaves its place
  const later = gridSpec([ag("n", "blocked"), ag("w")], "s1", prev);
  assert.deepEqual(later.tiles.map((a) => a.address), ["w", "n"]);
});

test("gridLayout works without structuredClone (Herdr's runtime lacks it)", () => {
  const saved = globalThis.structuredClone;
  globalThis.structuredClone = undefined;
  try {
    const out = gridLayout(base, gridSpec(many(2), "s1"));
    assert.equal(main(out).type, "column");
  } finally {
    globalThis.structuredClone = saved;
  }
});

test("a newcomer whose badge links where a placed tile's does lands next to it; placed tiles stay put", () => {
  const tk = (key) => ({ badge: { text: key, url: `https://example.com/${key}` } });
  const as = [ag("a", null, tk("X-1")), ag("b", null, tk("X-2")), ag("c", null, tk("X-3")), ag("n", null, tk("X-1"))];
  const s = gridSpec(as, "s1", ["a", "b", "c"]);
  assert.deepEqual(s.tiles.map((x) => x.address), ["a", "n", "b", "c"]);
  const lone = gridSpec([...as.slice(0, 3), ag("z")], "s1", ["a", "b", "c"]);
  assert.deepEqual(lone.tiles.map((x) => x.address), ["a", "b", "c", "z"]);
});

// Herdr's layout() can collapse the hidden `panel` column into its one child,
// losing `hidden`; the grid then showed a Files panel nothing could close.
test("grid leaves out the side panel, wrapped or collapsed", () => {
  const ids = (n) => [n.id, ...(n.children ?? []).flatMap(ids)];
  const spec = gridSpec([ag("t1")], "s1");
  const panelBody = { id: "panel-body", type: "stack", active: "files", children: [{ id: "files", type: "block", content: { mod: "files" } }] };
  const wrapped = { id: "root", type: "row", children: [{ id: "work-body", type: "row", children: [
    { id: "main", type: "block", content: { tab: "active" } },
    { id: "panel", type: "column", hidden: true, children: [panelBody] },
    { id: "rail", type: "block", content: { mod: "kit-rail" } }] }] };
  const collapsed = { id: "root", type: "row", children: [{ id: "work-body", type: "row", children: [
    { id: "main", type: "block", content: { tab: "active" } },
    { ...panelBody, size: { px: 94 } },
    { id: "rail", type: "block", content: { mod: "kit-rail" } }] }] };
  for (const b of [wrapped, collapsed]) {
    const got = ids(gridLayout(b, spec));
    assert.ok(!got.includes("panel") && !got.includes("panel-body") && !got.includes("files"), got.join(","));
    assert.ok(got.includes("rail"));
  }
});

const at = (space, tabs, terminal, tiles = ["t1", "t2"]) => ({ space, tabs, terminal, tiles });

test("gridLeave: entering only records, even if focus has no tile", () => {
  assert.equal(gridLeave(null, at("s1", ["a", "b"], "shell")).leave, false);
});

test("gridLeave: a new tab in the same space leaves the grid", () => {
  const { state } = gridLeave(null, at("s1", ["a", "b"], "t1"));
  assert.equal(gridLeave(state, at("s1", ["a", "b", "c"], "t1")).leave, true);
});

test("gridLeave: focus moving to a terminal with no tile leaves the grid", () => {
  const { state } = gridLeave(null, at("s1", ["a", "b"], "t1"));
  assert.equal(gridLeave(state, at("s1", ["a", "b"], "shell")).leave, true);
});

test("gridLeave: moving between tiles, or closing a tab, stays", () => {
  const { state } = gridLeave(null, at("s1", ["a", "b"], "t1"));
  assert.equal(gridLeave(state, at("s1", ["a", "b"], "t2")).leave, false);
  assert.equal(gridLeave(state, at("s1", ["a"], "t1")).leave, false);
});

test("gridLeave: switching spaces re-tiles instead of leaving", () => {
  const { state } = gridLeave(null, at("s1", ["a", "b"], "t1"));
  const next = gridLeave(state, at("s2", ["x", "y"], "u1", ["u1"]));
  assert.equal(next.leave, false);
  assert.equal(gridLeave(next.state, at("s2", ["x", "y", "z"], "u1", ["u1"])).leave, true);
});

test("spotlight: one tile, the rest of the space become cards", () => {
  const agents = [ag("t1"), ag("t2"), ag("t3"), ag("o1", null, { space: "s2" })];
  const spec = gridSpec(agents, "s1", [], "t2");
  assert.equal(spec.spotlight, "t2");
  assert.deepEqual(spec.tiles.map((a) => a.address), ["t2"]);
  assert.deepEqual(spec.cards.map((a) => a.address), ["t1", "t3"]);
  assert.equal(spec.cols, 1);
  const l = gridLayout(base, spec);
  const ids = kg(l).children.map((c) => c.id);
  assert.deepEqual(ids, ["grid-row-0", "grid-cards"]);
  assert.deepEqual(kg(l).children[1].content, { mod: "kit-rail", props: { strip: true } });
});

test("spotlight on a Claude outside the space is ignored", () => {
  const spec = gridSpec([ag("t1"), ag("t2")], "s1", [], "gone");
  assert.equal(spec.spotlight, null);
  assert.equal(spec.tiles.length, 2);
});

test("spotlight alone in its space has no card strip", () => {
  const l = gridLayout(base, gridSpec([ag("t1")], "s1", [], "t1"));
  assert.deepEqual(kg(l).children.map((c) => c.id), ["grid-row-0"]);
});

test("signature changes with the spotlight", () => {
  const agents = [ag("t1"), ag("t2")];
  assert.notEqual(gridSignature(gridSpec(agents, "s1", [], "t1")), gridSignature(gridSpec(agents, "s1", [], "t2")));
  assert.notEqual(gridSignature(gridSpec(agents, "s1", [], null)), gridSignature(gridSpec(agents, "s1", [], "t1")));
});

test("gridLanding: a tiled Claude gets focus, an untiled one the spotlight", () => {
  const agents = [ag("t1"), ag("t2")];
  assert.equal(gridLanding({ address: "t1", at: 0 }, agents, "s1", false, ["t1", "t2"], 1000), "focus");
  assert.equal(gridLanding({ address: "t2", at: 0 }, agents, "s1", false, ["t1"], 1000), "spotlight");
});

test("gridLanding: waits until the model has moved to the Claude's space", () => {
  const agents = [ag("t1"), ag("o1", null, { space: "s2" })];
  assert.equal(gridLanding({ address: "o1", at: 0 }, agents, "s1", false, ["t1"], 1000), "wait");
  assert.equal(gridLanding({ address: "o1", at: 0 }, agents, "s1", true, ["t1", "o1"], 1000), "focus");
});

test("gridLanding: drops a gone Claude or a stale request", () => {
  assert.equal(gridLanding({ address: "zz", at: 0 }, [ag("t1")], "s1", false, ["t1"], 1000), "drop");
  assert.equal(gridLanding({ address: "t1", at: 0 }, [ag("t1")], "s1", false, ["t1"], 10_000), "drop");
  assert.equal(gridLanding(null, [ag("t1")], "s1", false, ["t1"], 1000), "drop");
});

// Herdr 0.1.13's layout() folds a one-child column into its child, so a
// one-row grid comes back with no `main`: grid-row-0 (or a lone tile) sits
// straight in work-body. Every re-tile then threw "no node with id 'main'"
// and the grid stopped updating.
test("gridLayout rebuilds a grid whose main column Herdr folded away", () => {
  const ids = (n) => [n.id, ...(n.children ?? []).flatMap(ids)];
  const head = (t) => ({ id: `tile-${t}-head`, type: "block", content: { mod: "kit-pane", props: t } });
  const row = { id: "grid-row-0", type: "row", children: [
    { id: "tile-a", type: "column", children: [head("a"), { id: "tile-a-term", type: "block", content: { terminal: "a" } }] },
    head("b"),
  ] };
  const lone = { id: "tile-a", type: "column", children: [head("a")] };
  for (const folded of [row, lone]) {
    const b = { id: "root", type: "row", children: [{ id: "work-body", type: "row", children: [
      folded, { id: "rail", type: "block", content: { mod: "kit-rail" } }] }] };
    const out = gridLayout(b, gridSpec([ag("c"), ag("d")], "s1"));
    const body = out.children[0];
    assert.deepEqual(body.children.map((c) => c.id), ["kit-grid", "rail"]);
    const got = ids(out);
    assert.ok(got.includes("tile-c-term") && got.includes("tile-d-term"), got.join(","));
    assert.ok(!got.includes("tile-a") && !got.includes("tile-b-head"), got.join(","));
  }
});

test("all-spaces grid tiles every Claude in four columns; one space still caps at nine", () => {
  const many = Array.from({ length: 18 }, (_, i) => ({ address: `a${i}`, space: i % 2 ? "s1" : "s2", attention: {} }));
  const all = gridSpec(many, "s1", [], null, true);
  assert.equal(all.tiles.length, 18);
  assert.equal(all.cols, 4);
  assert.equal(all.chips.length, 0);
  const one = gridSpec([...many, ...many.map((a) => ({ ...a, address: `b${a.address}`, space: "s1" }))], "s1");
  assert.equal(one.tiles.length, 9);
});

test("tile borders take the light tone on a light theme", () => {
  const spec = { ...gridSpec([ag("b", "blocked"), ag("d", "done")], "s1"), light: true };
  const [b, d] = tiles(gridLayout(base, spec));
  assert.deepEqual(b.border, { width: 2, color: "#b35900" });
  assert.deepEqual(d.border, { width: 1, color: "#0969da" });
  assert.notEqual(gridSignature(spec), gridSignature({ ...spec, light: false }));
});

test("isLight splits white from the dark theme", () => {
  assert.equal(isLight("#ffffff"), true);
  assert.equal(isLight("#0d1117"), false);
  assert.equal(isLight(undefined), false);
});

test("the grid uses the one layout's settings picture", () => {
  const out = gridLayout({ ...base, preview: "layouts/endor.svg" }, gridSpec([ag("b", "blocked")], "s1"));
  assert.equal(out.preview, "layouts/scruffy.svg");
  assert.equal(gridLayout(out, gridSpec([], "s1")).preview, "layouts/scruffy.svg", "a re-tile keeps it");
  assert.equal(gridLayout(base, gridSpec([], "s1")).preview, "layouts/scruffy.svg");
});

test("tile borders take the scene's needs-you color", () => {
  const spec = { ...gridSpec([ag("b", "blocked"), ag("d", "done")], "s1"), scene: "endor" };
  const [b, d] = tiles(gridLayout(base, spec));
  assert.deepEqual(b.border, { width: 2, color: "#f2c14e" });
  assert.deepEqual(d.border, { width: 1, color: "#58a6ff" });
  const [lb] = tiles(gridLayout(base, { ...spec, light: true }));
  assert.deepEqual(lb.border, { width: 2, color: "#8a6400" });
  assert.notEqual(gridSignature(spec), gridSignature({ ...spec, scene: "tatooine" }));
});

test("the grid sits in a kit-grid node in main's place", () => {
  for (const spec of [gridSpec(many(3), "s1"), { cols: 1, tiles: [], chips: [] }]) {
    const out = gridLayout(base, spec);
    assert.equal(main(out).id, "kit-grid");
    assert.equal(isGridTree(out), true);
  }
  assert.equal(isGridTree(base), false);
});

test("a re-tile keeps resized tile sizes under the kit-grid wrapper", () => {
  const first = gridLayout(base, gridSpec(many(4), "s1"));
  kg(first).children[0].size = { fr: 3 };
  kg(first).children[0].children[1].size = { fr: 2 };
  const again = gridLayout(first, gridSpec(many(4), "s1"));
  assert.deepEqual(kg(again).children[0].size, { fr: 3 });
  assert.deepEqual(kg(again).children[0].children[1].size, { fr: 2 });
});

test("gridLayout rebuilds from a folded kit-grid", () => {
  const folded = { id: "root", type: "row", children: [{ id: "work-body", type: "row", children: [
    { id: "kit-grid", type: "column", children: [{ id: "grid-row-0", type: "row", children: [{ id: "tile-a", type: "column", children: [] }] }] },
    { id: "rail", type: "block", content: { mod: "kit-rail" } }] }] };
  const out = gridLayout(folded, gridSpec([ag("c")], "s1"));
  assert.deepEqual(out.children[0].children.map((c) => c.id), ["kit-grid", "rail"]);
  assert.deepEqual(kg(out).children.map((c) => c.id), ["grid-row-0"]);
  assert.equal(isGridTree(out), true);
});

// Herdr folds one-child columns into their child (the child's id survives):
// kit-grid > grid-row-0 reads back as a bare grid-row-0 where kit-grid was.
const fold = (out, keep) => {
  const body = out.children[0];
  const at = body.children.findIndex((c) => c.id === "kit-grid");
  body.children[at] = keep(body.children[at]);
  return out;
};
const rowOf = (kgNode) => kgNode.children[0];
const shapes = {
  "one row": () => fold(gridLayout(base, gridSpec(many(2), "s1")), rowOf),
  "lone tile": () => fold(gridLayout(base, gridSpec(many(1), "s1")), (k) => rowOf(k).children[0]),
};

test("gridLayout rebuilds a grid from the empty-grid placeholder", () => {
  const out = gridLayout(gridLayout(base, { cols: 1, tiles: [], chips: [] }), gridSpec([ag("c"), ag("d")], "s1"));
  assert.deepEqual(out.children[0].children.map((c) => c.id), ["kit-grid", "rail"]);
  assert.deepEqual(kg(out).children.map((c) => c.id), ["grid-row-0"]);
  assert.deepEqual(kg(out).size, { fr: 1 });
});

for (const [name, make] of Object.entries(shapes)) {
  test(`isGridTree sees a folded grid: ${name}`, () => {
    const folded = make();
    assert.equal(folded.children[0].children.some((c) => c.id === "kit-grid"), false);
    assert.equal(isGridTree(folded), true);
  });
  test(`gridLayout rebuilds a grid from a folded ${name}`, () => {
    const out = gridLayout(make(), gridSpec([ag("c"), ag("d")], "s1"));
    assert.deepEqual(out.children[0].children.map((c) => c.id), ["kit-grid", "rail"]);
    assert.deepEqual(kg(out).children.map((c) => c.id), ["grid-row-0"]);
    assert.equal(isGridTree(out), true);
  });
}

test("isGridTree is false for the focus layout", () => assert.equal(isGridTree(base), false));

import { spotKey } from "../herdr/mods/herdr-signals/grid.js";

test("spotKey: the spotlight keys move the spotlight in the grid and switch spaces elsewhere", () => {
  assert.deepEqual(spotKey("spot-next", "grid"), { spot: 1 });
  assert.deepEqual(spotKey("spot-prev", "grid"), { spot: -1 });
  assert.deepEqual(spotKey("spot-next", "focus"), { run: "space.next" });
  assert.deepEqual(spotKey("spot-prev", "focus"), { run: "space.prev" });
  assert.deepEqual(spotKey("spot-next", null), { run: "space.next" }, "off the kit layout too");
  assert.equal(spotKey("grid-all", "focus"), null);
});

// Herdr refuses a command argument nested more than 16 levels deep, and
// layout.set wraps the tree as {layout: tree}: the grid tree must stay at 15.
test("a full grid on the generated layout nests no deeper than layout.set allows", () => {
  const depth = (v) => (v && typeof v === "object" ? 1 + Math.max(0, ...Object.values(v).map(depth)) : 0);
  const scruffy = { id: "root", type: "row", children: [
    { id: "sidebar", type: "column", children: [{ id: "spaces", type: "block", content: { mod: "spaces" } }] },
    { id: "work", type: "column", children: [
      { id: "tabs", type: "block", content: { mod: "kit-tabs" } },
      { id: "work-body", type: "row", children: [
        { id: "main", type: "block", size: { fr: 1 }, content: { tab: "active" } },
        { id: "rail", type: "block", content: { mod: "kit-rail" } }] }] }] };
  const spec = { ...gridSpec(many(9), "s1"), light: false, scene: "kamino" };
  assert.ok(depth({ layout: gridLayout(scruffy, spec) }) <= 16, "layout.set's argument nests 16 deep at most");
});
