import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fakeCx } from "./support/gpui-stub.js";

const { Flares, cardGlyph, withCard, cardMark } = await import("../herdr/mods/kit-rail/look.js");

const opacity = (f, key) => f.overlay(key).calls.find((c) => c[0] === "opacity")[1];
const blocked = (pulse, since = 100) => [{ key: "a", kind: "blocked", since, pulse }];

test("a new block flares once, then goes dark", () => {
  const f = new Flares(), cx = fakeCx();
  f.update([], cx);
  f.update(blocked(true), cx);
  assert.ok(opacity(f, "a") > 0.5);
  cx.advance(1000);
  assert.equal(opacity(f, "a"), 0);
});

test("an unseen block re-flares at 15 s, then 30 s, then every 60 s", () => {
  const f = new Flares(), cx = fakeCx();
  f.update([], cx);
  f.update(blocked(true), cx);
  cx.advance(14_000);
  assert.equal(opacity(f, "a"), 0);
  cx.advance(1_100);
  assert.ok(opacity(f, "a") > 0.5, "re-flared at 15 s");
  cx.advance(1_000);
  assert.equal(opacity(f, "a"), 0);
  cx.advance(28_000);
  assert.equal(opacity(f, "a"), 0, "not yet 30 s after the first");
  cx.advance(1_000);
  assert.ok(opacity(f, "a") > 0.5, "re-flared 30 s later");
  cx.advance(1_000);
  cx.advance(58_000);
  assert.equal(opacity(f, "a"), 0, "not yet 60 s later");
  cx.advance(1_000);
  assert.ok(opacity(f, "a") > 0.5, "re-flared 60 s later");
  cx.advance(1_000);
  cx.advance(58_000);
  assert.equal(opacity(f, "a"), 0);
  cx.advance(1_000);
  assert.ok(opacity(f, "a") > 0.5, "and again 60 s later");
});

test("a snoozed Claude never flares", () => {
  const f = new Flares(), cx = fakeCx();
  const asleep = { key: "a", kind: "blocked", since: 100, pulse: true, snoozed: true };
  f.update([], cx);
  f.update([asleep], cx);
  assert.equal(opacity(f, "a"), 0);
  cx.advance(200_000);
  assert.equal(opacity(f, "a"), 0);
  assert.equal(cx.live(), 0, "no timers left running");
});

test("snoozing cancels re-flares already scheduled", () => {
  const f = new Flares(), cx = fakeCx();
  f.update([], cx);
  f.update(blocked(true), cx);
  cx.advance(1000);
  f.update([{ key: "a", kind: "blocked", since: 100, pulse: true, snoozed: true }], cx);
  cx.advance(60_000);
  assert.equal(opacity(f, "a"), 0);
  assert.equal(cx.live(), 0);
});

test("a block already there at start re-flares but doesn't flare at once", () => {
  const f = new Flares(), cx = fakeCx();
  f.update(blocked(true), cx);
  assert.equal(opacity(f, "a"), 0);
  cx.advance(15_100);
  assert.ok(opacity(f, "a") > 0.5);
});

test("seeing it stops the re-flares", () => {
  const f = new Flares(), cx = fakeCx();
  f.update([], cx);
  f.update(blocked(true), cx);
  cx.advance(1000);
  f.update(blocked(false), cx);
  cx.advance(60_000);
  assert.equal(opacity(f, "a"), 0);
  assert.equal(cx.live(), 0, "no timers left running");
});

test("answering it stops the re-flares", () => {
  const f = new Flares(), cx = fakeCx();
  f.update([], cx);
  f.update(blocked(true), cx);
  f.update([{ key: "a", kind: null, since: null }], cx);
  cx.advance(60_000);
  assert.equal(opacity(f, "a"), 0);
  assert.equal(cx.live(), 0);
});

test("a new block episode restarts the clock with one timer", () => {
  const f = new Flares(), cx = fakeCx();
  f.update([], cx);
  f.update(blocked(true, 100), cx);
  cx.advance(10_000);
  f.update(blocked(true, 200), cx);
  assert.ok(opacity(f, "a") > 0.5, "new episode flares at once");
  cx.advance(1000);
  f.update(blocked(true, 200), cx);
  assert.equal(cx.live(), 1, "only the new episode's clock runs");
  cx.advance(13_000);
  assert.equal(opacity(f, "a"), 0, "old clock is gone");
  cx.advance(1_100);
  assert.ok(opacity(f, "a") > 0.5);
});

const { cardClick } = await import("../herdr/mods/kit-rail/look.js");
const grid = (spotlight, tiles) => ({ view: "grid", space: "s1", spotlight, tiles });

test("cardClick: in the focus view, open the grid on that Claude", () => {
  assert.deepEqual(cardClick("t1", "s1", {}), { grid: "t1" }, "no view yet counts as focus");
  assert.deepEqual(cardClick("t1", "s1", { view: "focus" }), { grid: "t1" });
  assert.deepEqual(cardClick("o1", "s2", { view: "focus" }), { grid: "o1" });
});

test("cardClick: in the grid, a tiled Claude gets focus, an untiled one the spotlight", () => {
  assert.deepEqual(cardClick("t1", "s1", grid(null, ["t1", "t2"])), { focus: "t1" });
  assert.deepEqual(cardClick("t9", "s1", grid(null, ["t1", "t2"])), { spotlight: "t9" });
});

test("cardClick: with a spotlight, any card in the space swaps in", () => {
  assert.deepEqual(cardClick("t3", "s1", grid("t1", ["t1"])), { spotlight: "t3" });
});

test("cardClick: a Claude in another space gets focus", () => {
  assert.deepEqual(cardClick("o1", "s2", grid("t1", ["t1"])), { focus: "o1" });
});

test("card glyphs: run, decide, ask; nothing otherwise", () => {
  assert.deepEqual(["run", "decide", "ask"].map(cardGlyph), ["▶", "◆", "?"]);
  for (const junk of [null, undefined, "", "x", "toString"]) assert.equal(cardGlyph(junk), null);
  assert.equal(withCard("run", "Bash: ls"), "▶ Bash: ls");
  assert.equal(withCard(null, "Bash: ls"), "Bash: ls");
  assert.equal(cardMark(null, "#fff"), null);
  const calls = cardMark("decide", "#ec8e2c").calls;
  assert.deepEqual(calls.find((c) => c[0] === "child"), ["child", "◆"]);
  assert.deepEqual(calls.find((c) => c[0] === "text_color"), ["text_color", "#ec8e2c"]);
});

const { tabKind } = await import("../herdr/mods/kit-rail/look.js");

test("tabKind: herdr-kit's kind wins, else a blocked/done Herdr status, never a bare dot", () => {
  assert.equal(tabKind("blocked", "done"), "blocked");
  assert.equal(tabKind("done", "idle"), "done");
  assert.equal(tabKind(null, "blocked"), "blocked");
  assert.equal(tabKind(undefined, "done"), "done");
  assert.equal(tabKind(null, "working"), null);
  assert.equal(tabKind(null, "idle"), null);
  assert.equal(tabKind(null, undefined), null);
});

test("kit-tabs draws no colour-only status dot", () => {
  const src = readFileSync(new URL("../herdr/mods/kit-tabs/main.js", import.meta.url), "utf8");
  assert.ok(!/bg\(t\[c\.status\]\)/.test(src), "a tab state must carry a glyph, not just a coloured dot");
  assert.ok(src.includes("tabKind(kit?.kind, c.status)"));
});
