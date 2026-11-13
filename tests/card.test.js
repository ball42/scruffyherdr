import { test } from "node:test";
import assert from "node:assert/strict";
import { initialCardState, cardStep, buildCard, askLine, waitedTag } from "../herdr/mods/herdr-signals/card.js";

const AWAY = { away: true, graceSeconds: 60, doneMinSeconds: 180 };
const HERE = { ...AWAY, away: false };
const a = (address, status, extra = {}) => ({ address, status, name: `name-${address}`, focused: false, ...extra });

// Runs [snapshot, seconds, cfg?] frames; returns every action and the final state.
function run(frames) {
  let state = initialCardState();
  const actions = [];
  for (const [snap, sec, cfg] of frames) {
    const out = cardStep(state, snap, sec * 1000, cfg ?? AWAY);
    state = out.state;
    if (out.action) actions.push(out.action);
  }
  return { state, actions };
}

test("first poll is baseline", () => {
  const { actions } = run([[[a("t1", "blocked")], 0], [[a("t1", "blocked")], 120]]);
  assert.equal(actions.length, 0);
});

test("no push while at the mac", () => {
  const { actions } = run([
    [[a("t1", "working")], 0, HERE],
    [[a("t1", "blocked")], 2, HERE],
    [[a("t1", "blocked")], 300, HERE],
  ]);
  assert.equal(actions.length, 0);
});

test("switching tabs at the mac never pushes", () => {
  const { actions } = run([
    [[a("t1", "working", { focused: true })], 0, HERE],
    [[a("t1", "blocked", { focused: true })], 2, HERE],
    [[a("t1", "blocked", { focused: false })], 90, HERE],
  ]);
  assert.equal(actions.length, 0);
});

test("blocked under grace never pushes", () => {
  const { actions } = run([
    [[a("t1", "working")], 0],
    [[a("t1", "blocked")], 2],
    [[a("t1", "blocked")], 50],
    [[a("t1", "working")], 55],
  ]);
  assert.equal(actions.length, 0);
});

test("blocked past grace while away posts once", () => {
  const { actions } = run([
    [[a("t1", "working")], 0],
    [[a("t1", "blocked")], 2],
    [[a("t1", "blocked")], 62],
    [[a("t1", "blocked")], 64],
    [[a("t1", "blocked")], 200],
  ]);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, "post");
  assert.deepEqual(actions[0].items.map((i) => [i.address, i.kind, i.name]), [["t1", "blocked", "name-t1"]]);
});

test("second claude edits the same card", () => {
  const { actions } = run([
    [[a("t1", "working"), a("t2", "working")], 0],
    [[a("t1", "blocked"), a("t2", "working")], 2],
    [[a("t1", "blocked"), a("t2", "blocked")], 62],
    [[a("t1", "blocked"), a("t2", "blocked")], 130],
  ]);
  assert.deepEqual(actions.map((x) => x.type), ["post", "edit"]);
  assert.equal(actions[1].items.length, 2);
});

test("back at the mac ends the episode, next away posts new", () => {
  const { actions } = run([
    [[a("t1", "working")], 0],
    [[a("t1", "blocked")], 2],
    [[a("t1", "blocked")], 62],
    [[a("t1", "working")], 70, HERE],
    [[a("t1", "blocked")], 80],
    [[a("t1", "blocked")], 150],
  ]);
  assert.deepEqual(actions.map((x) => x.type), ["post", "post"]);
});

test("long turn done while away joins card", () => {
  const { actions } = run([
    [[a("t1", "idle")], 0],
    [[a("t1", "working")], 2],
    [[a("t1", "done")], 250],
  ]);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].items[0].kind, "done");
  assert.equal(actions[0].items[0].minutes, 4);
});

test("short turn stays silent", () => {
  const { actions } = run([
    [[a("t1", "idle")], 0],
    [[a("t1", "working")], 2],
    [[a("t1", "done")], 60],
  ]);
  assert.equal(actions.length, 0);
});

test("a claude already blocked at startup is not sent", () => {
  const { actions } = run([[[a("t1", "blocked")], 0], [[a("t1", "blocked")], 500]]);
  assert.equal(actions.length, 0);
});

test("card title and colors", () => {
  const blocked = buildCard([{ address: "t1", kind: "blocked", name: "web-app" }], 0);
  assert.equal(blocked.embeds[0].title, "✋ 1 needs you");
  assert.equal(blocked.embeds[0].color, 0xec8e2c);
  assert.match(blocked.embeds[0].description, /✋ \*\*web-app\*\*/);
  const done = buildCard([{ address: "t2", kind: "done", name: "garden-log", minutes: 6 }], 0);
  assert.equal(done.embeds[0].title, "✓ 1 done");
  assert.equal(done.embeds[0].color, 0x58a6ff);
  assert.match(done.embeds[0].description, /✓ \*\*garden-log\*\* — finished after 6 min/);
  const both = buildCard([
    { address: "t2", kind: "done", name: "g", minutes: 6 },
    { address: "t1", kind: "blocked", name: "p" },
    { address: "t3", kind: "blocked", name: "q" },
  ], 0);
  assert.equal(both.embeds[0].title, "✋ 2 need you · ✓ 1 done");
  assert.ok(both.embeds[0].description.indexOf("**g**") > both.embeds[0].description.indexOf("**q**"));
  assert.match(both.embeds[0].footer.text, /^since \d{1,2}:\d{2}/);
  assert.equal(both.username, "Herdr");
});

test("card caps long lists", () => {
  const items = Array.from({ length: 400 }, (_, i) => ({ address: `t${i}`, kind: "blocked", name: `claude-number-${i}` }));
  const d = buildCard(items, 0).embeds[0].description;
  assert.ok(d.length <= 4000);
  assert.match(d, /… and \d+ more$/);
});

test("no mentions allowed", () => {
  const c = buildCard([{ address: "t1", kind: "blocked", name: "@everyone" }], 0);
  assert.deepEqual(c.allowed_mentions, { parse: [] });
});

test("buildCard: a blocked line carries the card glyph and the question", () => {
  const body = buildCard([
    { address: "a", kind: "blocked", name: "web-app", ask: "Bash: npm publish", card: "decide" },
    { address: "b", kind: "blocked", name: "quiet", ask: null, card: null },
    { address: "c", kind: "blocked", name: "odd", ask: "x", card: "nonsense" },
  ], 0);
  assert.deepEqual(body.embeds[0].description.split("\n"), [
    "✋ ◆ **web-app** · Bash: npm publish",
    "✋ **quiet**",
    "✋ **odd** · x",
  ]);
});

test("askLine: one line, cut to 120 characters", () => {
  assert.equal(askLine("Run\n  the   tests?"), "Run the tests?");
  const long = askLine("y".repeat(300));
  assert.equal(long.length, 120);
  assert.ok(long.endsWith("…"));
  assert.equal(askLine(null), "");
});

test("buildCard: long questions still keep the description under 4000", () => {
  const items = Array.from({ length: 80 }, (_, i) => ({ address: `a${i}`, kind: "blocked", name: `n${i}`, ask: "q".repeat(500), card: "ask" }));
  const d = buildCard(items, 0).embeds[0].description;
  assert.ok(d.length <= 4000, `${d.length}`);
  assert.match(d, /… and \d+ more$/);
});

test("cardStep: blocked items carry ask and card, and a new question edits the card", () => {
  let st = initialCardState();
  ({ state: st } = cardStep(st, [a("x", "working")], 0, AWAY));
  ({ state: st } = cardStep(st, [a("x", "blocked", { ask: "Q1", card: "ask" })], 1000, AWAY));
  let out = cardStep(st, [a("x", "blocked", { ask: "Q1", card: "ask" })], 62000, AWAY);
  assert.equal(out.action.type, "post");
  assert.deepEqual([out.action.items[0].ask, out.action.items[0].card], ["Q1", "ask"]);
  out = cardStep(out.state, [a("x", "blocked", { ask: "Q2", card: "decide" })], 64000, AWAY);
  assert.equal(out.action?.type, "edit");
  assert.equal(out.action.items[0].ask, "Q2");
});

test("a blocked line says how long it has waited, as a Discord relative time", () => {
  const body = buildCard([{ address: "a", kind: "blocked", name: "web-app", ask: "Run it?", card: "ask", since: 1794267210999 }], 0);
  assert.equal(body.embeds[0].description, "✋ ? **web-app** · Run it? · <t:1794267210:R>");
  assert.equal(waitedTag(null), "");
  assert.equal(waitedTag(undefined), "");
});

test("the wait time rides on blockedSince, and time passing alone never edits the card", () => {
  const cfg = { away: true, graceSeconds: 60, doneMinSeconds: 180 };
  let st = initialCardState();
  st = cardStep(st, [a("t1", "working")], 0, cfg).state;
  st = cardStep(st, [a("t1", "blocked")], 1000, cfg).state;
  const post = cardStep(st, [a("t1", "blocked")], 62_000, cfg);
  assert.equal(post.action.type, "post");
  assert.equal(post.action.items[0].since, 1000);
  const later = cardStep(post.state, [a("t1", "blocked")], 600_000, cfg);
  assert.equal(later.action, null);
});
