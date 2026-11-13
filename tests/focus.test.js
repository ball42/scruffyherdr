import { test } from "node:test";
import assert from "node:assert/strict";
import "./support/gpui-stub.js";
import { DIGEST_MS, FOCUS_MAX_MINUTES, focusDigest, focusExpired, focusHolds, focusLabel, focusLimitMs, focusOn, focusToggle } from "../herdr/mods/herdr-signals/focus.js";
import { buildModel } from "../herdr/mods/herdr-signals/model.js";
import { summary } from "../herdr/mods/herdr-signals/policy.js";

const MIN = 60_000;
const T0 = 1_000_000_000;

test("toggle: on records the start, off clears it", () => {
  const f = focusToggle(null, T0);
  assert.deepEqual(f, { since: T0 });
  assert.equal(focusOn(f), true);
  assert.equal(focusToggle(f, T0 + 5), null);
  assert.equal(focusOn(null), false);
  assert.equal(focusOn({ since: "x" }), false);
});

test("holds: only done is held, and only while focus is on", () => {
  const f = { since: T0 };
  assert.equal(focusHolds(f, "done"), true);
  assert.equal(focusHolds(f, "blocked"), false);
  assert.equal(focusHolds(f, "working"), false);
  assert.equal(focusHolds(null, "done"), false);
});

test("auto-off: after focus_max_minutes, default 120; junk falls back", () => {
  const f = { since: T0 };
  assert.equal(focusExpired(f, T0 + 119 * MIN, 120), false);
  assert.equal(focusExpired(f, T0 + 120 * MIN, 120), true);
  assert.equal(focusExpired(f, T0 + 30 * MIN, 30), true);
  assert.equal(focusExpired(f, T0 + 100 * MIN, undefined), false);
  assert.equal(focusLimitMs(0), FOCUS_MAX_MINUTES * MIN);
  assert.equal(focusLimitMs("x"), FOCUS_MAX_MINUTES * MIN);
  assert.equal(focusExpired(null, T0 + 999 * MIN, 120), false);
});

test("label: focus, then focusing with the minutes", () => {
  assert.equal(focusLabel(null, T0), "◎ focus");
  assert.equal(focusLabel({ since: T0 }, T0 + 10_000), "◎ focusing");
  assert.equal(focusLabel({ since: T0 }, T0 + 23 * MIN), "◎ focusing 23m");
  assert.equal(focusLabel({ since: T0 }, T0 + 65 * MIN), "◎ focusing 1h 5m");
});

const row = (address, status, since, name = address) => ({ address, name, status, attention: { kind: status, since } });

test("digest: Claudes that went done during focus and are still done, oldest first", () => {
  const f = { since: T0 };
  const rows = [
    row("a", "done", T0 + 10 * MIN, "web-app"),
    row("b", "done", T0 - MIN, "before"),
    row("c", "blocked", T0 + MIN),
    row("d", "done", T0 + 2 * MIN, "todo-list"),
    row("e", "working", T0 + 3 * MIN),
  ];
  const d = focusDigest(f, rows, T0 + 42 * MIN);
  assert.equal(d.count, 2);
  assert.equal(d.first, "d");
  assert.equal(d.text, "While you focused (42m): 2 finished: todo-list, web-app");
});

test("digest: none finished is null; a long list is cut", () => {
  assert.equal(focusDigest({ since: T0 }, [row("a", "working", T0)], T0 + MIN), null);
  assert.equal(focusDigest(null, [row("a", "done", T0)], T0), null);
  const many = Array.from({ length: 8 }, (_, i) => row(`p${i}`, "done", T0 + i));
  assert.match(focusDigest({ since: T0 }, many, T0 + 5 * MIN).text, /8 finished: p0, p1, p2, p3, p4, p5, \+2 more$/);
  assert.equal(DIGEST_MS, 60_000);
});

const agent = (address, status) => ({ address, tab: address, space: "s", space_name: "s", status, seq: 1 });
const att = (kind) => ({ kind, since: T0 + 5, seen: false });

test("model: focus holds done rows like a snooze but not blocked ones", () => {
  const agents = [agent("a", "done"), agent("b", "blocked")];
  const attention = { a: att("done"), b: att("blocked") };
  const m = buildModel(agents, {}, attention, "s", {}, T0 + 10, [], {}, {}, { since: T0 });
  const a = m.agents.find((r) => r.address === "a");
  const b = m.agents.find((r) => r.address === "b");
  assert.equal(a.snoozed, true);
  assert.equal(a.snooze_focus, true);
  assert.equal(b.snoozed, false);
  assert.equal(b.attention.pulse, true, "blocked still pulses");
  const off = buildModel(agents, {}, attention, "s", {}, T0 + 10);
  assert.equal(off.agents.find((r) => r.address === "a").snoozed, false);
});

test("summary: held done Claudes count apart and leave the done count", () => {
  const agents = [agent("a", "done"), agent("b", "blocked"), agent("c", "done")];
  const attention = { a: att("done"), b: att("blocked"), c: att("done") };
  const s = summary(buildModel(agents, {}, attention, "s", {}, T0 + 10, [], {}, {}, { since: T0 }).agents);
  assert.equal(s.blocked, 1);
  assert.equal(s.done, 0);
  assert.equal(s.held, 2);
  assert.equal(s.top_name, "b");
});

const { stripCounts, focusButton, digestLine } = await import("../herdr/mods/herdr-signals/strip.js");
const { snoozeLabel, snoozeControls } = await import("../herdr/mods/kit-rail/look.js");
const TH = { blocked: "#o", done: "#b", hover: "#h", muted: "#m", foreground: "#f" };
const call = (el, name) => el.calls.find((c) => c[0] === name);

test("strip: held done shows muted with the focus glyph, and is not a button", () => {
  const parts = stripCounts(TH, { blocked: 1, done: 0, held: 3 }, () => {});
  assert.deepEqual(parts.map((p) => call(p, "id")[1]), ["strip-blocked", "strip-held"]);
  const held = parts[1];
  assert.equal(call(held, "child")[1], "◎ 3 done");
  assert.equal(call(held, "text_color")[1], "#m");
  assert.equal(call(held, "on_click"), undefined);
  assert.equal(stripCounts(TH, { blocked: 0, done: 0, held: 0 }, () => []).length, 0);
});

test("strip: the focus button toggles and shows the running time", () => {
  let n = 0;
  const off = focusButton(TH, null, T0, () => n++);
  assert.equal(call(off, "child")[1], "◎ focus");
  call(off, "on_click")[1]();
  const on = focusButton(TH, { since: T0 }, T0 + 23 * MIN, () => n++);
  assert.equal(call(on, "child")[1], "◎ focusing 23m");
  assert.equal(call(on, "text_color")[1], "#f");
  call(on, "on_click")[1]();
  assert.equal(n, 2);
});

test("strip: the digest line lasts 60 s and goes to the first finished Claude", () => {
  let went = 0;
  const digest = { count: 5, minutes: "42m", first: "d", until: T0 + DIGEST_MS };
  const el = digestLine(TH, digest, T0 + 1000, () => went++);
  assert.equal(call(el, "child")[1], "✓ 5 finished while you focused (42m)");
  call(el, "on_click")[1]();
  assert.equal(went, 1);
  assert.equal(digestLine(TH, digest, T0 + DIGEST_MS, () => {}), null);
  assert.equal(digestLine(TH, null, T0, () => {}), null);
});

test("rail: a focus-held row reads ◎ focus and keeps the snooze choices, not wake", () => {
  const held = { snoozed: true, snooze_focus: true, snooze_until: null, snooze_till_done: false };
  assert.equal(snoozeLabel(held, 0), "◎ focus");
  const ids = (a) => snoozeControls({ dim: "#d", border: "#b", foreground: "#f", hover: "#h" }, "x", a, () => {}).calls.filter((c) => c[0] === "child" || c[0] === "children");
  const heldCalls = ids(held);
  assert.equal(heldCalls[0][0], "children", "choices, as for an awake Claude");
  const snoozedCalls = ids({ snoozed: true });
  assert.equal(snoozedCalls[0][0], "child", "wake pill");
});
