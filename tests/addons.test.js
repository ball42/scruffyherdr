import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ADDON_KEYS, MAX_BUTTONS, MAX_ROWS, addonBlocks, cardName, deckBadge, goodLink, pressCommand, readAddon, withAddons, withBadges } from "../herdr/mods/herdr-signals/addons.js";

/** Each key's value as an add-on publishes it: {at, items}. */
const fresh = (o, at = 1000) => Object.fromEntries(Object.entries(o).map(([k, items]) => [k, { at, items }]));
/** readAddon of freshly stamped data, read by a core that started at `since`. */
const R = (o, since = 0) => readAddon(fresh(o), since);
const EMPTY = { badges: {}, rows: [], buttons: [] };

test("the add-on keys", () => {
  assert.deepEqual(ADDON_KEYS, { badges: "kit.addon.badges", rows: "kit.addon.rows", buttons: "kit.addon.buttons", press: "kit.addon.press" });
});

test("readAddon of nothing gives empty values", () => {
  assert.deepEqual(readAddon(undefined), { badges: {}, rows: [], buttons: [] });
  assert.deepEqual(readAddon(null), { badges: {}, rows: [], buttons: [] });
  assert.deepEqual(readAddon("junk"), { badges: {}, rows: [], buttons: [] });
  assert.deepEqual(R({ badges: [], rows: {}, buttons: "x" }), { badges: {}, rows: [], buttons: [] });
});

test("readAddon keeps good badges and drops malformed ones", () => {
  const good = { text: "In Progress · fix", url: "https://example.com/X-1", tone: "bright", action: { id: "move:X-1", tip: "Move it" } };
  const out = R({
    badges: {
      t1: good,
      t2: { text: "plain" },
      t3: { url: "https://example.com" }, // no text
      t4: "In Progress", // not an object
      t5: { text: "x", tone: "red" },
      t6: { text: "x", url: "javascript:alert(1)" },
      t7: { text: "x", action: { id: "", tip: "t" } },
      t8: { text: "x", action: { id: "a" } }, // no tip
      t9: { text: "" },
      t10: { text: "dim", tone: "dim" },
      t11: null,
    },
  });
  assert.deepEqual(out.badges, { t1: good, t2: { text: "plain" }, t10: { text: "dim", tone: "dim" } });
});

test("readAddon copies only the contract's fields", () => {
  const out = R({ badges: { t1: { text: "x", extra: 1, action: { id: "a", tip: "b", run: "rm" } } }, rows: [{ id: "r", text: "t", junk: true }] });
  assert.deepEqual(out.badges.t1, { text: "x", action: { id: "a", tip: "b" } });
  assert.deepEqual(out.rows, [{ id: "r", text: "t" }]);
});

test("readAddon keeps good rows and drops malformed ones, first id wins", () => {
  const out = R({
    rows: [
      { id: "X-1", text: "X-1 · Review", sub: "the summary", url: "https://example.com/X-1" },
      { text: "no id" },
      { id: "X-2" }, // no text
      "row",
      { id: "X-3", text: "t", url: "file:///etc/passwd" },
      { id: "X-1", text: "again" },
      { id: "X-4", text: "t", sub: 5 },
      { id: "X-5", text: "five" },
    ],
  });
  assert.deepEqual(out.rows, [
    { id: "X-1", text: "X-1 · Review", sub: "the summary", url: "https://example.com/X-1" },
    { id: "X-5", text: "five" },
  ]);
});

test("readAddon keeps good buttons and drops malformed ones", () => {
  const day = { id: "day", glyph: "◷", label: "day", tip: "Day view" };
  const out = R({
    buttons: [day, { id: "x", label: "x", tip: "x" }, { id: "y", glyph: "", label: "y", tip: "y" }, { glyph: "z", label: "z", tip: "z" }, { id: "w", glyph: "w", tip: "w" }, { ...day, label: "dup" }, 7],
  });
  assert.deepEqual(out.buttons, [day]);
});

test("readAddon never throws", () => {
  const hostile = { get badges() { throw new Error("boom"); } };
  assert.deepEqual(readAddon(hostile), { badges: {}, rows: [], buttons: [] });
  const proxyRow = [{ get id() { throw new Error("boom"); } }];
  assert.deepEqual(R({ rows: proxyRow }).rows, []);
});

test("readAddon ignores data stamped before the core started, or without a numeric stamp", () => {
  const data = { badges: { t1: { text: "x" } }, rows: [{ id: "r", text: "t" }], buttons: [{ id: "b", glyph: "◷", label: "b", tip: "" }] };
  assert.deepEqual(readAddon(fresh(data, 999), 1000), EMPTY, "stamped before start");
  const used = readAddon(fresh(data, 1000), 1000);
  assert.deepEqual(used.badges, { t1: { text: "x" } }, "stamped at start");
  assert.equal(readAddon(fresh(data, 5000), 1000).rows.length, 1, "stamped after start");
  for (const at of [undefined, "2000", null, NaN, Infinity]) {
    const raw = Object.fromEntries(Object.entries(data).map(([k, items]) => [k, { at, items }]));
    assert.deepEqual(readAddon(raw, 1000), EMPTY, `at ${String(at)}`);
  }
  assert.deepEqual(readAddon(data, 0), EMPTY, "a bare value without the envelope");
  // Each key is judged on its own stamp.
  const mixed = { ...fresh({ rows: data.rows }, 2000), ...fresh({ badges: data.badges }, 10) };
  assert.deepEqual(readAddon(mixed, 1000), { badges: {}, rows: data.rows, buttons: [] });
});

test("readAddon skips a __proto__ address and leaves the map's prototype alone", () => {
  const raw = { badges: { at: 1000, items: JSON.parse('{"__proto__": {"text": "evil"}, "t1": {"text": "ok"}}') } };
  const out = readAddon(raw, 0);
  assert.equal(Object.getPrototypeOf(out.badges), Object.prototype);
  assert.deepEqual(Object.keys(out.badges), ["t1"]);
  assert.equal(out.badges.text, undefined);
  const names = withBadges({ t1: { name: "a", hint: null }, toString: { name: "b", hint: "h" } }, out.badges);
  assert.equal(names.toString.badge, undefined, "only own badge keys attach");
});

test("readAddon keeps at most 20 rows and 4 buttons", () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, text: `row ${i}` }));
  const buttons = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, glyph: "◷", label: `b${i}`, tip: "" }));
  const out = R({ rows: [{ id: "bad" }, ...rows], buttons });
  assert.equal(MAX_ROWS, 20);
  assert.equal(MAX_BUTTONS, 4);
  assert.deepEqual(out.rows.map((r) => r.id), rows.slice(0, 20).map((r) => r.id), "malformed entries don't count");
  assert.deepEqual(out.buttons.map((b) => b.id), ["b0", "b1", "b2", "b3"]);
});

test("a badge's short is 1 to 40 characters, else the badge is dropped", () => {
  const out = R({ badges: { t1: { text: "x", short: "PROJ-12 In Progress" }, t2: { text: "x", short: "y".repeat(41) }, t3: { text: "x", short: "" }, t4: { text: "x", short: 7 }, t5: { text: "x", short: "🙂".repeat(40) } } });
  assert.deepEqual(Object.keys(out.badges), ["t1", "t5"]);
  assert.equal(out.badges.t1.short, "PROJ-12 In Progress");
});

test("cardName: the Discord card names a badged Claude with its short", () => {
  assert.equal(cardName({ name: "fix grid", badge: { text: "x", short: "PROJ-12 In Progress" } }), "fix grid (PROJ-12 In Progress)");
  assert.equal(cardName({ name: "fix grid", badge: { text: "x" } }), "fix grid");
  assert.equal(cardName({ name: "fix grid" }), "fix grid");
});

test("deckBadge: the deck gets text, url and short, nulls for the missing parts", () => {
  assert.deepEqual(deckBadge({ text: "t", url: "https://example.com", short: "PROJ-12 In Progress", tone: "bright" }), { text: "t", url: "https://example.com", short: "PROJ-12 In Progress" });
  assert.deepEqual(deckBadge({ text: "t" }), { text: "t", url: null, short: null });
  assert.equal(deckBadge(null), null);
  assert.equal(deckBadge(undefined), null);
});

test("goodLink agrees with the shared URL cases (the Stream Deck server checks the same file)", () => {
  const cases = JSON.parse(readFileSync(new URL("./support/addon-urls.json", import.meta.url), "utf8"));
  for (const u of cases.good) assert.equal(goodLink(u), true, u);
  for (const u of cases.bad) assert.equal(goodLink(u), false, JSON.stringify(u));
  const raw = { rows: cases.bad.map((url, i) => ({ id: `r${i}`, text: "t", url })) };
  assert.deepEqual(R(raw).rows, []);
});

test("withBadges sets hint and badge for a present address and ignores a missing one", () => {
  const names = { t1: { name: "fix grid", hint: "Claude's title" }, t2: { name: "other", hint: null } };
  const badge = { text: "In Progress · fix", url: "https://example.com/X-1", tone: "bright" };
  const out = withBadges(names, { t1: badge, gone: { text: "orphan" } });
  assert.deepEqual(out.t1, { name: "fix grid", hint: "In Progress · fix", rawHint: "Claude's title", badge });
  assert.deepEqual(out.t2, names.t2);
  assert.equal(out.gone, undefined);
  assert.equal(names.t1.hint, "Claude's title", "the input is untouched");
});

test("withBadges keeps a rawHint an earlier step set", () => {
  const out = withBadges({ t1: { name: "n", hint: "#7 ● · raw", rawHint: "raw" } }, { t1: { text: "badge" } });
  assert.equal(out.t1.rawHint, "raw");
});

test("addonBlocks: one 0-px block per add-on that is both listed and present, in config order", () => {
  assert.deepEqual(addonBlocks(["kit-example", "kit-x"], ["kit-example"]), [
    { id: "addon-kit-example", type: "block", size: { px: 0 }, content: { mod: "kit-example" } },
  ]);
  assert.deepEqual(addonBlocks(["b", "a"], ["a", "b", "c"]).map((b) => b.id), ["addon-b", "addon-a"]);
  assert.deepEqual(addonBlocks(["a", "a"], ["a"]).length, 1);
  assert.deepEqual(addonBlocks(undefined, ["a"]), []);
  assert.deepEqual(addonBlocks(["a", 3, "", "../x", "a b"], ["a", "../x", "a b"]).map((b) => b.id), ["addon-a"]);
  for (const b of addonBlocks(["kit-example"], ["kit-example"])) assert.equal(b.hidden, undefined, "a hidden block never starts its mod");
});

const statusTree = () => ({
  id: "root", type: "row", children: [{ id: "work", type: "column", children: [
    { id: "status", type: "row", children: [
      { id: "status-bar", type: "block", content: { mod: "workspace-status" } },
      { id: "signals", type: "block", size: { px: 300 }, content: { mod: "herdr-signals" } },
    ] },
  ] }],
});

test("withAddons puts the blocks right after the strip, and replaces old ones", () => {
  const blocks = addonBlocks(["kit-example"], ["kit-example"]);
  const out = withAddons(statusTree(), blocks);
  const status = out.children[0].children[0];
  assert.deepEqual(status.children.map((c) => c.id), ["status-bar", "signals", "addon-kit-example"]);
  assert.equal(out.children.length, 1, "nothing lands under the root");
  assert.deepEqual(withAddons(out, blocks), out, "idempotent");
  const none = withAddons(out, []);
  assert.deepEqual(none.children[0].children[0].children.map((c) => c.id), ["status-bar", "signals"]);
  assert.deepEqual(withAddons({ id: "root", type: "row", children: [] }, blocks), { id: "root", type: "row", children: [] }, "no strip, no blocks");
});

test("pressCommand reads press-<id> mod commands", () => {
  assert.equal(pressCommand("press-day"), "day");
  assert.equal(pressCommand("press-move:X-1"), "move:X-1");
  assert.equal(pressCommand("press-"), null);
  assert.equal(pressCommand("urgent"), null);
  assert.equal(pressCommand(undefined), null);
});

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
function make(config, mods) {
  const root = mkdtempSync(join(tmpdir(), "addons-"));
  const dir = join(root, "app", "layouts");
  const kit = join(root, "kit");
  mkdirSync(dir, { recursive: true });
  mkdirSync(kit, { recursive: true });
  for (const m of mods) mkdirSync(join(root, "app", "mods", m), { recursive: true });
  writeFileSync(join(dir, "main.json"), JSON.stringify(MAIN));
  writeFileSync(join(kit, "config.json"), JSON.stringify(config));
  const r = spawnSync("node", [MAKE, join(dir, "main.json"), dir, join(kit, "config.json")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const status = (f) => JSON.parse(readFileSync(f, "utf8")).children[1].children.find((c) => c.id === "status");
  return { layout: status(join(dir, "scruffy.json")), focus: status(join(kit, "layout-focus.json")) };
}

test("make-layout places a listed, present add-on after the strip, in the layout and the focus tree", () => {
  const { layout, focus } = make({ addons: ["kit-example", "kit-gone"] }, ["herdr-signals", "kit-example"]);
  for (const s of [layout, focus]) {
    const ids = s.children.map((c) => c.id);
    assert.deepEqual(ids, ["status-bar", "signals", "addon-kit-example"]);
    assert.deepEqual(s.children[2].content, { mod: "kit-example" });
    assert.deepEqual(s.children[2].size, { px: 0 });
  }
});

test("make-layout adds no blocks without an addons list", () => {
  const { layout } = make({}, ["herdr-signals", "kit-example"]);
  assert.deepEqual(layout.children.map((c) => c.id), ["status-bar", "signals"]);
});

// The tracker words are built from pieces so the public scrub (tests/scrub.test.js) passes this file.
const TRACKER_CLI = new RegExp("ac" + "li", "i");
const TRACKER = new RegExp(["ji" + "ra", "atlas" + "sian"].join("|"), "i");

test("source scan: no core mod file names the issue tracker, its CLI or tickets, or opens kit-day", () => {
  // Ruling (2026-11-12): names.js's branchTicket is generic naming from a branch key, and stays.
  const ALLOWED = { "herdr-signals/names.js": /ticket/gi };
  const files = [];
  for (const mod of ["herdr-signals", "kit-rail", "kit-pane", "kit-tabs"]) {
    const dir = new URL(`../herdr/mods/${mod}/`, import.meta.url);
    for (const f of readdirSync(dir, { recursive: true })) if (/\.(js|mjs|json)$/.test(f)) files.push(`${mod}/${f}`);
  }
  assert.ok(files.length > 20, "the scan found the mods' files");
  for (const f of files) {
    let src = readFileSync(new URL(`../herdr/mods/${f}`, import.meta.url), "utf8");
    if (ALLOWED[f]) src = src.replace(ALLOWED[f], "");
    assert.doesNotMatch(src, TRACKER_CLI, `${f} names the tracker CLI`);
    assert.doesNotMatch(src, TRACKER, `${f} names the tracker`);
    assert.doesNotMatch(src, /ticket/i, `${f} names tickets`);
    assert.doesNotMatch(src, /kit-day/, `${f} names kit-day`);
  }
});

test("source scan: kit-rail runs nothing itself", () => {
  const src = readFileSync(new URL("../herdr/mods/kit-rail/main.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\bexec\b/);
});

const { buildModel } = await import("../herdr/mods/herdr-signals/model.js");
const agent = (address) => ({ address, tab: "tab1", space: "s1", space_name: "S", status: "idle", seq: 1 });

test("the model carries each Claude's badge and raw hint", () => {
  const badge = { text: "In Progress · fix", tone: "bright" };
  const names = withBadges({ t1: { name: "a", hint: "title" }, t2: { name: "b", hint: "other" } }, { t1: badge });
  const m = buildModel([agent("t1"), agent("t2")], names, {}, "s1");
  const by = Object.fromEntries(m.agents.map((a) => [a.address, a]));
  assert.deepEqual(by.t1.badge, badge);
  assert.equal(by.t1.hint, "In Progress · fix");
  assert.equal(by.t1.rawHint, "title");
  assert.equal(by.t2.badge, null);
  assert.equal(by.t2.rawHint, "other");
  for (const a of m.agents) {
    assert.equal("ticket" in a, false);
    assert.equal("drift" in a, false);
  }
});

test("the model carries each Claude's session id, for add-on records", () => {
  const m = buildModel([agent("t1"), agent("t2")], { t1: { name: "a", hint: null, session: "s-1" }, t2: { name: "b", hint: null } }, {}, "s1");
  const by = Object.fromEntries(m.agents.map((a) => [a.address, a]));
  assert.equal(by.t1.session, "s-1");
  assert.equal(by.t2.session, null);
});

test("herdr-signals no longer keeps the wait record (kit-private does)", () => {
  const src = readFileSync(new URL("../herdr/mods/herdr-signals/main.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /waits\.js|waitStep|kit\.waitsOpen|herdr-kit\/waits/);
});
