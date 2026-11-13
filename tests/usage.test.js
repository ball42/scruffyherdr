import { test } from "node:test";
import assert from "node:assert/strict";
import "./support/gpui-stub.js";

const U = await import("../herdr/mods/herdr-signals/usage.js");
const { deckUsage } = await import("../herdr/mods/herdr-signals/policy.js");
const { usageItem } = await import("../herdr/mods/herdr-signals/strip.js");

const REAL = '{"limits": [{"minutes": 300, "used": 14, "resets": 1794417600}, {"minutes": 10080, "used": 50, "resets": 1794718800}], "at": 1794404535.8}';
const MIN = 60_000;
const at = (h, m = 0) => new Date(2026, 10, 11, h, m).getTime() / 1000;
const hm = (h, m) => new Date(2026, 10, 11, h, m).getTime();

test("parseLimits reads the real file shape", () => {
  const l = U.parseLimits(REAL);
  assert.deepEqual(l.five, { used: 14, resets: 1794417600 });
  assert.deepEqual(l.week, { used: 50, resets: 1794718800 });
  assert.equal(l.at, 1794404535.8);
});

test("parseLimits: missing or malformed means no meter, never a throw", () => {
  for (const bad of [null, undefined, "", "not json", "[]", "null", '{"limits": 3}', '{"limits": [], "at": 1}', '{"limits":[{"minutes":300,"used":"x","resets":1}],"at":1}', '{"limits":[{"minutes":300,"used":5,"resets":9}]}']) {
    assert.equal(U.parseLimits(bad), null, String(bad));
  }
  const one = U.parseLimits('{"limits":[{"minutes":10080,"used":5,"resets":9}],"at":1}');
  assert.equal(one.five, null);
  assert.equal(one.week.used, 5);
});

test("clockTime: local wall clock, no :00 on the hour, weekday for the week", () => {
  assert.equal(U.clockTime(at(14, 40)), "2:40p");
  assert.equal(U.clockTime(at(9, 0)), "9a");
  assert.equal(U.clockTime(at(0, 5)), "12:05a");
  assert.equal(U.clockTime(at(12, 0)), "12p");
  assert.equal(U.clockTime(at(9, 0), true), "Wed 9a"); // 2026-11-11 is a Wednesday
});

test("thresholds are named constants", () => {
  assert.equal(U.WARN_5H, 80);
  assert.equal(U.WARN_WEEK, 90);
});

// --- pace
const pts = (...a) => a.map(([min, used]) => ({ at: hm(10, 0) + min * MIN, used }));
const RESET = hm(15, 0) / 1000;

test("projectOut: no projection under 30 minutes of history", () => {
  assert.equal(U.projectOut(pts([0, 10], [29, 40]), RESET), null);
  assert.equal(U.projectOut(pts([0, 10]), RESET), null);
  assert.equal(U.projectOut([], RESET), null);
});

test("projectOut: none when flat or falling", () => {
  assert.equal(U.projectOut(pts([0, 30], [40, 30]), RESET), null);
  assert.equal(U.projectOut(pts([0, 30], [40, 20]), RESET), null);
});

test("projectOut: none if 100% would land after the reset", () => {
  // 1% per 10 min from 10% at 10:40: 100% is 15 hours away
  assert.equal(U.projectOut(pts([0, 6], [40, 10]), RESET), null);
});

test("projectOut: projects the time 100% lands, before the reset", () => {
  // 10 -> 50 in 40 min = 1%/min; 50 left at 10:40 = 11:30
  assert.equal(U.projectOut(pts([0, 10], [40, 50]), RESET), hm(11, 30));
});

test("projectOut: uses the last 30+ minutes, not the whole history", () => {
  // slow at first, fast lately: 10:00 5, 10:30 6, 11:00 36 (1%/min) -> 64 left = 12:04
  assert.equal(U.projectOut(pts([0, 5], [30, 6], [60, 36]), RESET), hm(12, 4));
});

test("projectOut: already at 100 is not a projection", () => {
  assert.equal(U.projectOut(pts([0, 80], [40, 100]), RESET), null);
});

test("paceAdd: appends new readings, ignores repeats, clears when resets changes", () => {
  let h = U.paceAdd(null, { used: 10, resets: 100 }, 1000);
  h = U.paceAdd(h, { used: 10, resets: 100 }, 1000);
  assert.equal(h.points.length, 1);
  h = U.paceAdd(h, { used: 15, resets: 100 }, 1000 + MIN - 1);
  assert.equal(h.points.length, 1, "under a minute later is skipped");
  h = U.paceAdd(h, { used: 20, resets: 100 }, 1000 + MIN);
  assert.equal(h.points.length, 2);
  h = U.paceAdd(h, { used: 3, resets: 200 }, 3000);
  assert.deepEqual(h, { resets: 200, points: [{ at: 3000, used: 3 }] });
  assert.deepEqual(U.paceAdd(h, null, 4000), { resets: null, points: [] });
});

test("paceAdd: bounded", () => {
  let h = null;
  for (let i = 0; i < 1000; i++) h = U.paceAdd(h, { used: i % 100, resets: 5 }, i + 1);
  assert.ok(h.points.length <= 200);
});

// --- view
const lim = (five, week, atSec) => ({ five, week, at: atSec });
const NOW = hm(12, 0);

test("usageView: calm numbers", () => {
  const v = U.usageView(lim({ used: 14, resets: at(14, 40) }, { used: 50, resets: at(9, 0) + 86400 * 2 }, NOW / 1000 - 60), null, NOW);
  assert.equal(v.five.text, "5h 14%");
  assert.equal(v.week.text, "wk 50%");
  assert.equal(v.five.over, false);
  assert.equal(v.week.over, false);
  assert.equal(v.out, null);
  assert.equal(v.stale, false);
  assert.match(v.tip, /5h window: 14% used, resets 2:40p/);
  assert.match(v.tip, /week: 50% used, resets Fri 9a/);
});

test("usageView: over the thresholds gets the warning glyph", () => {
  const v = U.usageView(lim({ used: 80, resets: at(14) }, { used: 90, resets: at(14) + 86400 }, NOW / 1000), null, NOW);
  assert.equal(v.five.text, "⚠ 5h 80%");
  assert.equal(v.five.over, true);
  assert.equal(v.week.text, "⚠ wk 90%");
  const calm = U.usageView(lim({ used: 79, resets: at(14) }, { used: 89, resets: at(14) + 86400 }, NOW / 1000), null, NOW);
  assert.equal(calm.five.over, false);
  assert.equal(calm.week.over, false);
});

test("usageView: pace adds out ~time", () => {
  const h = { resets: at(15), points: pts([0, 10], [40, 50]) };
  const v = U.usageView(lim({ used: 50, resets: at(15) }, null, hm(10, 40) / 1000), h, hm(10, 41));
  assert.equal(v.out, "⚠ out ~11:30a");
  assert.equal(v.week, null);
});

test("usageView: stale after 10 minutes, with as-of in the tooltip and no out", () => {
  const h = { resets: at(15), points: pts([0, 10], [40, 50]) };
  const fresh = U.usageView(lim({ used: 50, resets: at(15) }, null, hm(10, 40) / 1000), h, hm(10, 40) + 10 * MIN);
  assert.equal(fresh.stale, false);
  const v = U.usageView(lim({ used: 50, resets: at(15) }, null, hm(10, 40) / 1000), h, hm(10, 40) + 10 * MIN + 1000);
  assert.equal(v.stale, true);
  assert.equal(v.out, null);
  assert.match(v.tip, /as of 10:40a/);
});

test("usageView: a window past its reset shows a dash until a fresh reading", () => {
  const v = U.usageView(lim({ used: 95, resets: at(11) }, { used: 95, resets: at(11) }, hm(10, 55) / 1000), null, NOW);
  assert.equal(v.five.text, "5h —");
  assert.equal(v.five.over, false);
  assert.equal(v.week.text, "wk —");
  assert.equal(v.out, null);
});

test("usageView: no limits, no view", () => {
  assert.equal(U.usageView(null, null, NOW), null);
  assert.equal(U.usageView(lim(null, null, 1), null, NOW), null);
});

// --- deck payload
test("deckUsage: numbers, reset text and flags for the deck", () => {
  const h = { resets: at(15), points: pts([0, 10], [40, 50]) };
  const v = U.usageView(lim({ used: 82, resets: at(15) }, { used: 50, resets: at(9) + 86400 * 2 }, hm(10, 40) / 1000), h, hm(10, 41));
  const d = deckUsage(v);
  assert.deepEqual(d.five, { used: 82, reset: "3p", over: true });
  assert.deepEqual(d.week, { used: 50, reset: "Fri 9a", over: false });
  assert.equal(d.out, "11:30a");
  assert.equal(d.stale, false);
});

test("deckUsage: null without a meter; expired window has null numbers", () => {
  assert.equal(deckUsage(null), null);
  const v = U.usageView(lim({ used: 95, resets: at(11) }, null, hm(10, 55) / 1000), null, NOW);
  assert.deepEqual(deckUsage(v).five, { used: null, reset: null, over: false });
});

// --- strip element, in both themes
const call = (el, n) => el.calls.find((c) => c[0] === n)?.slice(1);
const all = (el, n) => el.calls.filter((c) => c[0] === n).map((c) => c.slice(1));
// Real graphite (dark) and paper (light) values for the tokens the meter uses.
const DARK = { chrome: "#161a1f", muted: "#8b949e", foreground: "#e6edf3", blocked: "#ec8e2c", hover: "#222" };
const LIGHT = { chrome: "#f3f1ec", muted: "#6b6f76", foreground: "#1f2328", blocked: "#ec8e2c", hover: "#ddd" };
const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

function bar(el) {
  // the meter is the child div holding the track: find the element with a w() percent fill inside
  const found = [];
  const walk = (e) => { for (const [k, v] of e.calls.map((c) => [c[0], c[1]])) if (k === "child" && v && v.calls) { found.push(v); walk(v); } };
  walk(el);
  return found;
}

for (const [name, T] of [["dark", DARK], ["light", LIGHT]]) {
  test(`usageItem (${name}): fill reads against the track and the strip`, () => {
    const v = U.usageView(lim({ used: 40, resets: at(15) }, { used: 10, resets: at(15) + 86400 }, NOW / 1000), null, NOW);
    const el = usageItem(T, v);
    assert.equal(call(el, "id")[0], "strip-usage");
    assert.ok(call(el, "tooltip")[0].includes("resets 3p"));
    const els = bar(el);
    const fill = els.find((e) => call(e, "w")?.[0] === "40%");
    assert.ok(fill, "a fill 40% wide");
    assert.equal(call(fill, "bg")[0], T.muted);
    assert.ok(Math.abs(lum(call(fill, "bg")[0]) - lum(T.chrome)) > 0.25, "fill contrasts with the strip");
    const track = els.find((e) => call(e, "opacity"));
    assert.ok(call(track, "opacity")[0] <= 0.3, "track is a faint step of the same token");
    assert.equal(call(track, "bg")[0], T.muted);
  });

  test(`usageItem (${name}): over the threshold the fill and text are the needs-you orange, with the glyph`, () => {
    const v = U.usageView(lim({ used: 85, resets: at(15) }, null, NOW / 1000), null, NOW);
    const el = usageItem(T, v);
    const fill = bar(el).find((e) => call(e, "w")?.[0] === "85%");
    assert.equal(call(fill, "bg")[0], "#ec8e2c");
    const texts = all(el, "child").map((a) => a[0]).filter((x) => typeof x === "string").join("|") + bar(el).flatMap((e) => all(e, "child").map((a) => a[0])).filter((x) => typeof x === "string").join("|");
    assert.match(texts, /⚠ 5h 85%/);
  });
}

test("usageItem: stale is dimmed; no view is no item", () => {
  assert.equal(usageItem(DARK, null), null);
  const v = U.usageView(lim({ used: 40, resets: at(15) }, null, hm(11, 0) / 1000), null, NOW);
  assert.equal(v.stale, true);
  assert.ok(call(usageItem(DARK, v), "opacity")[0] < 1);
  const fresh = U.usageView(lim({ used: 40, resets: at(15) }, null, NOW / 1000), null, NOW);
  assert.equal(call(usageItem(DARK, fresh), "opacity"), undefined);
});

test("paceAdd keeps one reading a minute, so a busy hour still has 30+ minutes of history", () => {
  let h = null;
  const t0 = 1_000_000_000_000;
  for (let i = 0; i <= 3600; i += 5) h = U.paceAdd(h, { used: 10 + i / 360, resets: 9e9 }, t0 + i * 1000);
  assert.ok(h.points.length <= 61, String(h.points.length));
  assert.ok(h.points[h.points.length - 1].at - h.points[0].at >= 30 * 60_000);
});
