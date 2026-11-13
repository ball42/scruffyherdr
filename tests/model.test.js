import { test } from "node:test";
import assert from "node:assert/strict";
import { cardStale, attentionStep, buildModel, urgencyOrder, urgentHit } from "../herdr/mods/herdr-signals/model.js";

const ag = (address, status, extra = {}) => ({
  address, status, tab: `tab-${address}`, space: "s1", space_name: "code", seq: 0, focused: false, ...extra,
});
const names = (as) => Object.fromEntries(as.map((a) => [a.address, { name: `n-${a.address}`, hint: null, source: "rename" }]));

test("blocked starts unseen with since", () => {
  const s = attentionStep({}, [ag("t1", "blocked")], 100);
  assert.deepEqual(s.t1, { kind: "blocked", since: 100, seen: false });
});

test("focus marks blocked seen, pulse stops", () => {
  let s = attentionStep({}, [ag("t1", "blocked")], 100);
  s = attentionStep(s, [ag("t1", "blocked", { focused: true })], 102);
  assert.deepEqual(s.t1, { kind: "blocked", since: 100, seen: true });
  const m = buildModel([ag("t1", "blocked")], names([ag("t1")]), s, "s1");
  assert.equal(m.agents[0].attention.pulse, false);
});

test("seen blocked stays seen while blocked", () => {
  let s = attentionStep({}, [ag("t1", "blocked", { focused: true })], 100);
  s = attentionStep(s, [ag("t1", "blocked")], 102);
  assert.equal(s.t1.seen, true);
  assert.equal(s.t1.since, 100);
});

test("leaving blocked clears", () => {
  let s = attentionStep({}, [ag("t1", "blocked")], 100);
  s = attentionStep(s, [ag("t1", "working")], 102);
  assert.deepEqual(s.t1, { kind: null, since: null, seen: false });
  s = attentionStep(s, [ag("t1", "blocked")], 104);
  assert.deepEqual(s.t1, { kind: "blocked", since: 104, seen: false });
});

test("done is steady", () => {
  let s = attentionStep({}, [ag("t1", "done")], 100);
  s = attentionStep(s, [ag("t1", "done")], 200);
  assert.deepEqual(s.t1, { kind: "done", since: 100, seen: false });
  const m = buildModel([ag("t1", "done")], names([ag("t1")]), s, "s1");
  assert.deepEqual(m.agents[0].attention, { kind: "done", since: 100, pulse: false });
});

test("sort: current space first, blocked before done before working", () => {
  const as = [
    ag("w", "working", { seq: 9 }),
    ag("o", "blocked", { space: "s2", space_name: "Alpha" }),
    ag("d", "done"),
    ag("i", "idle"),
    ag("b", "blocked"),
  ];
  const m = buildModel(as, names(as), attentionStep({}, as, 1), "s1");
  assert.deepEqual(m.agents.map((a) => a.address), ["b", "d", "w", "i", "o"]);
  assert.deepEqual(urgencyOrder(m), ["b", "d", "w", "i", "o"]);
  assert.equal(m.current_space, "s1");
  assert.equal(m.v, 1);
});

test("sort: other spaces by their most urgent Claude, then by name", () => {
  const as = [
    ag("h", "idle"),
    ag("a1", "idle", { space: "sa", space_name: "Alpha" }),
    ag("z1", "working", { space: "sz", space_name: "Zulu" }),
    ag("z2", "blocked", { space: "sz", space_name: "Zulu" }),
    ag("m1", "done", { space: "sm", space_name: "Mike" }),
    ag("b1", "idle", { space: "sb", space_name: "Bravo" }),
  ];
  const m = buildModel(as, names(as), attentionStep({}, as, 1), "s1");
  assert.deepEqual(m.agents.map((a) => a.address), ["h", "z2", "z1", "m1", "a1", "b1"]);
});

test("sort: a snoozed Claude doesn't lift its space", () => {
  const as = [
    ag("z", "blocked", { space: "sa", space_name: "Alpha" }),
    ag("m", "done", { space: "sm", space_name: "Mike" }),
  ];
  const m = buildModel(as, names(as), attentionStep({}, as, 1), "s1", { z: 10_000 }, 0);
  assert.equal(m.agents.find((a) => a.address === "z").snoozed, true);
  assert.deepEqual(m.agents.map((a) => a.address), ["m", "z"]);
});

test("sort: an open card lifts its space above a done one", () => {
  const as = [
    ag("d", "done", { space: "sa", space_name: "Alpha" }),
    ag("c", "idle", { space: "sz", space_name: "Zulu" }),
  ];
  const n = names(as);
  n.c.card = "run";
  const m = buildModel(as, n, attentionStep({}, as, 1), "s1");
  assert.deepEqual(m.agents.map((a) => a.address), ["c", "d"]);
});

test("tab takes most urgent agent", () => {
  const as = [ag("t1", "working", { tab: "A" }), ag("t2", "blocked", { tab: "A" })];
  const m = buildModel(as, names(as), attentionStep({}, as, 5), "s1");
  assert.deepEqual(m.tabs.A, { name: null, kind: "blocked", pulse: true, since: 5 });
});

test("split tab keeps its own label, only the glyph follows urgency", () => {
  const as = [ag("t1", "working", { tab: "A", seq: 1 }), ag("t2", "done", { tab: "A", seq: 2 })];
  const m = buildModel(as, names(as), attentionStep({}, as, 5), "s1");
  assert.equal(m.tabs.A.name, null);
  assert.equal(m.tabs.A.kind, "done");
});

test("a snoozed blocked Claude never pulses; pins and snooze reach the row", () => {
  const a = { address: "a", tab: "t", space: "s1", space_name: "P", status: "blocked", seq: 0, focused: false };
  const att = attentionStep({}, [a], 100);
  const names = { a: { name: "A", hint: null } };
  const awake = buildModel([a], names, att, "s1").agents[0];
  assert.equal(awake.attention.pulse, true);
  const asleep = buildModel([a], names, att, "s1", { a: 500 }, 100, ["a"]).agents[0];
  assert.deepEqual([asleep.snoozed, asleep.pinned, asleep.attention.pulse], [true, true, false]);
  assert.equal(buildModel([a], names, att, "s1", { a: 50 }, 100).agents[0].snoozed, false, "expired");
  assert.equal(asleep.snooze_until, 500);
  const tillDone = buildModel([a], names, att, "s1", { a: { done: 90 } }, 100).agents[0];
  assert.deepEqual([tillDone.snoozed, tillDone.snooze_until, tillDone.snooze_till_done, tillDone.attention.pulse], [true, null, true, false]);
});

test("a Claude with an open card ranks between blocked and done", () => {
  const ag = (address, status) => ({ address, tab: address, space: "s", space_name: "S", status, seq: 0 });
  const names = { b: { name: "b" }, d: { name: "d" }, q: { name: "q", card: "decide" } };
  const m = buildModel([ag("d", "done"), ag("q", "idle"), ag("b", "blocked")], names, {}, "s");
  assert.deepEqual(m.agents.map((a) => a.address), ["b", "q", "d"]);
});

test("a card goes stale 30 minutes after it showed", () => {
  const t0 = 1_000_000;
  assert.equal(cardStale(t0, t0 + 29 * 60_000), false);
  assert.equal(cardStale(t0, t0 + 30 * 60_000), true);
  assert.equal(cardStale(null, t0), false);
  const ag = { address: "q", tab: "q", space: "s", space_name: "S", status: "idle", seq: 0 };
  const m = (now) => buildModel([ag], { q: { name: "q", card: "ask", card_at: t0 } }, {}, "s", {}, now).agents[0].card_stale;
  assert.deepEqual([m(t0 + 60_000), m(t0 + 31 * 60_000)], [false, true]);
});

test("urgentHit: first blocked, else first done, skipping snoozed", () => {
  const ag = (address, kind, snoozed = false) => ({ address, snoozed, attention: { kind } });
  assert.equal(urgentHit([ag("d", "done"), ag("b", "blocked")]).address, "b");
  assert.equal(urgentHit([ag("b", "blocked", true), ag("d", "done")]).address, "d");
  assert.equal(urgentHit([ag("w", null)]), null);
  assert.equal(urgentHit(undefined), null);
});

test("model: menu and perm only while blocked, ask_text only when done or idle", () => {
  const menu = { questions: [{ header: "H", question: "Q?", multi: false, options: [{ label: "A", description: "" }] }] };
  const perm = { tool: "Bash", detail: "ls" };
  const pick = (status) => {
    const a = { address: "a", tab: "t", space: "s1", space_name: "P", status, seq: 0, focused: false };
    const nm = { a: { name: "A", hint: null, menu, perm, ask_text: "x?" } };
    return buildModel([a], nm, attentionStep({}, [a], 1), "s1").agents[0];
  };
  const blocked = pick("blocked");
  assert.deepEqual([blocked.menu, blocked.perm, blocked.ask_text], [menu, perm, null]);
  const done = pick("done");
  assert.deepEqual([done.menu, done.perm, done.ask_text], [null, null, "x?"]);
  const idle = pick("idle");
  assert.deepEqual([idle.menu, idle.perm, idle.ask_text], [null, null, "x?"]);
  const working = pick("working");
  assert.deepEqual([working.menu, working.perm, working.ask_text], [null, null, null]);
});

test("a Run card whose every run went clean no longer counts as waiting", () => {
  const a = { address: "r", tab: "r", space: "s", space_name: "S", status: "idle", seq: 0 };
  const runs = [{ id: "1", label: "a", command: "x" }, { id: "2", label: "b", command: "y" }];
  const clean = { "r-1": { state: "done", exit: 0 }, "r-2": { state: "done", exit: 0 } };
  const card = (runstate, extra = {}) =>
    buildModel([a], { r: { name: "r", card: "run", runs, ...extra } }, {}, "s", {}, 0, [], {}, runstate).agents[0].card;
  assert.equal(card(clean), null);
  assert.equal(card({ "r-1": { state: "done", exit: 0 } }), "run");
  assert.equal(card({ ...clean, "r-2": { state: "done", exit: 1 } }), "run");
  assert.equal(card(clean, { asks: ["which box?"] }), "run");
  assert.equal(card({}), "run");
});
