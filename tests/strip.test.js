import { test } from "node:test";
import assert from "node:assert/strict";
import "./support/gpui-stub.js";

const { stripCounts } = await import("../herdr/mods/herdr-signals/strip.js");
const T = { blocked: "#o", done: "#b", hover: "#h" };
const call = (el, name) => el.calls.find((c) => c[0] === name);

test("strip counts are buttons that go to the most urgent Claude", () => {
  let clicks = 0;
  const parts = stripCounts(T, { blocked: 2, done: 1 }, () => clicks++);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map((p) => call(p, "id")[1]), ["strip-blocked", "strip-done"]);
  assert.deepEqual(parts.map((p) => call(p, "child")[1]), ["✋ 2 NEEDS YOU", "✓ 1 DONE"]);
  for (const p of parts) {
    assert.ok(call(p, "cursor_pointer"), "shows a pointer");
    assert.ok(call(p, "hover"), "has a hover state");
    call(p, "on_click")[1]();
  }
  assert.equal(clicks, 2);
});

test("strip counts: none when nothing needs you", () => {
  assert.deepEqual(stripCounts(T, { blocked: 0, done: 0 }, () => {}), []);
  assert.equal(stripCounts(T, { blocked: 0, done: 3 }, () => {}).length, 1);
});

const { blockedLabel, waitAge } = await import("../herdr/mods/herdr-signals/strip.js");
const { summary } = await import("../herdr/mods/herdr-signals/policy.js");

test("strip: no age under a minute, then minutes, then hours", () => {
  const now = 10_000_000;
  assert.equal(blockedLabel({ blocked: 1, oldest_since: now - 59_000 }, now), "✋ 1 NEEDS YOU");
  assert.equal(blockedLabel({ blocked: 2, oldest_since: now - 14 * 60_000 }, now), "✋ 2 NEEDS YOU · 14m");
  assert.equal(waitAge(now - 65 * 60_000, now), "1h 5m");
  assert.equal(waitAge(now - 120 * 60_000, now), "2h");
  assert.equal(blockedLabel({ blocked: 1, oldest_since: null }, now), "✋ 1 NEEDS YOU");
});

test("strip: the age is the longest wait among unsnoozed blocked Claudes", () => {
  const now = 10_000_000;
  const rows = [
    { address: "a", status: "blocked", attention: { since: now - 5 * 60_000 } },
    { address: "b", status: "blocked", attention: { since: now - 30 * 60_000 }, snoozed: true },
    { address: "c", status: "blocked", attention: { since: now - 9 * 60_000 } },
    { address: "d", status: "done", attention: { since: now - 90 * 60_000 } },
  ];
  const s = summary(rows);
  assert.equal(s.blocked, 2, "the snoozed Claude isn't counted");
  assert.equal(blockedLabel(s, now), "✋ 2 NEEDS YOU · 9m");
  const [el] = stripCounts(T, s, () => {}, 0, now);
  assert.equal(call(el, "child")[1], "✋ 2 NEEDS YOU · 9m");
});

test("strip: the asks count is a button too, for the next Claude with a card", () => {
  let asked = 0;
  const parts = stripCounts(T, { blocked: 0, done: 0 }, () => {}, 3, 0, () => asked++);
  assert.equal(parts.length, 1);
  assert.equal(call(parts[0], "id")[1], "strip-asks");
  assert.equal(call(parts[0], "child")[1], "☀☀ 3 asks");
  assert.ok(call(parts[0], "cursor_pointer"));
  call(parts[0], "on_click")[1]();
  assert.equal(asked, 1);
});

test("strip: the asks count shows a fir with a firefly on Endor", () => {
  const t = { ...T, foreground: "#f", accent: "#a" };
  const [tat] = stripCounts(t, { blocked: 0, done: 0 }, () => {}, 1, 0, () => {}, "tatooine");
  assert.equal(call(tat, "child")[1], "☀☀ 1 ask");
  const [hoth] = stripCounts(t, { blocked: 0, done: 0 }, () => {}, 1, 0, () => {}, "hoth");
  assert.equal(call(hoth, "child")[1], "❄ 1 ask", "the glyph follows the kit.scene key");
  const [none] = stripCounts(t, { blocked: 0, done: 0 }, () => {}, 1, 0, () => {}, "endor-grid");
  assert.equal(call(none, "child")[1], "☀☀ 1 ask", "a layout name isn't a scene key");
  const [end] = stripCounts(t, { blocked: 0, done: 0 }, () => {}, 2, 0, () => {}, "endor");
  const label = call(end, "child")[1];
  const kids = label.calls.filter((c) => c[0] === "child").map((c) => c[1]);
  assert.equal(kids[1], "2 asks");
  assert.equal(kids[0].calls.find((c) => c[0] === "child")[1].calls[0][1], "mods/kit-rail/tree.svg");
});

const { focusButton } = await import("../herdr/mods/herdr-signals/strip.js");
test("focus button: a short label while off, the full one while on", () => {
  const off = focusButton({ ...T, muted: "#m", foreground: "#f" }, null, 0, () => {}, "◎");
  assert.equal(call(off, "child")[1], "◎");
  assert.equal(call(focusButton({ ...T, muted: "#m", foreground: "#f" }, null, 0, () => {}), "child")[1], "◎ focus");
});
