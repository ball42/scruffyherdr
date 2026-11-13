import { test } from "node:test";
import assert from "node:assert/strict";
import { deckAsks, summary } from "../herdr/mods/herdr-signals/policy.js";

const agent = (address, status) => ({ address, status });

test("summary picks blocked over done", () => {
  const s = summary([agent("t1", "done"), agent("t2", "blocked"), agent("t3", "working")]);
  assert.deepEqual({ ...s, agents: undefined }, { blocked: 1, done: 1, held: 0, top: "t2", top_name: null, top_card: null, top_since: null, oldest_since: null, agents: undefined });
});

test("summary is empty when nothing needs you", () => {
  const e = summary([agent("t1", "working")]);
  assert.deepEqual([e.blocked, e.done, e.top, e.top_name], [0, 0, null, null]);
});

test("summary includes top name", () => {
  const s = summary([{ address: "t1", status: "done", name: "docs" }, { address: "t2", status: "blocked", name: "web-app" }]);
  assert.equal(s.top_name, "web-app");
  assert.equal(summary([{ address: "t1", status: "working", name: "x" }]).top_name, null);
});

test("summary leaves snoozed Claudes out, by flag or by set", () => {
  const rows = [
    { address: "a", status: "blocked", name: "A", snoozed: true },
    { address: "b", status: "done", name: "B" },
  ];
  const s = summary(rows);
  assert.deepEqual([s.blocked, s.done, s.top], [0, 1, "b"]);
  const t = summary(rows.map(({ snoozed, ...r }) => r), new Set(["a"]));
  assert.deepEqual([t.blocked, t.done, t.top], [0, 1, "b"]);
});

test("summary lists up to 5 agents in order, snoozed left out", () => {
  const rows = [
    { address: "a", status: "blocked", name: "A", snoozed: true },
    { address: "b", status: "done", name: "B" },
    { address: "c", status: "working", name: "C" },
  ];
  assert.deepEqual(summary(rows).agents, [
    { address: "b", name: "B", kind: "done", status: "done", card: null, since: null },
    { address: "c", name: "C", kind: null, status: "working", card: null, since: null },
  ]);
  const many = Array.from({ length: 8 }, (_, i) => ({ address: `x${i}`, status: "working", name: `x${i}` }));
  assert.equal(summary(many).agents.length, 5);
});

test("deckAsks counts Claudes with a card and points past the focused one", () => {
  const row = (address, status, n, snoozed = false) => ({ address, status, snoozed, card: n ? "ask" : null });
  const rows = [row("t1", "idle", 2), row("t2", "working", 5), row("t3", "done", 1), row("t4", "idle", 4, true)];
  assert.deepEqual(deckAsks(rows, "t1"), { count: 2, next: "t3" });
  assert.deepEqual(deckAsks(rows, "t3"), { count: 2, next: "t1" });
  assert.deepEqual(deckAsks([row("t1", "idle", 1)], "t1"), { count: 1, next: "t1" });
  assert.deepEqual(deckAsks([], null), { count: 0, next: null });
});

test("summary carries the card of the top Claude and of each key", () => {
  const s = summary([{ address: "t1", status: "done", card: "ask" }, { address: "t2", status: "blocked", card: "run" }, { address: "t3", status: "working" }]);
  assert.equal(s.top_card, "run");
  assert.deepEqual(s.agents.map((a) => a.card), ["ask", "run", null]);
  assert.equal(summary([{ address: "t1", status: "working" }]).top_card, null);
});

test("summary sends when the top Claude and each blocked or done one started waiting", () => {
  const at = (a, since) => ({ ...a, attention: { kind: a.status, since } });
  const s = summary([at(agent("t1", "done"), 500), at(agent("t2", "blocked"), 900), at(agent("t3", "working"), 100)]);
  assert.equal(s.top_since, 900);
  assert.deepEqual(s.agents.map((a) => a.since), [500, 900, null], "a working Claude has no wait");
  assert.equal(summary([agent("t1", "blocked")]).top_since, null, "no attention: null");
});
