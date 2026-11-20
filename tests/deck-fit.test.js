import { test } from "node:test";
import assert from "node:assert/strict";
import { deckApprove } from "../herdr/mods/herdr-signals/approve.js";
import { deckBadge, MAX_DECK_URL } from "../herdr/mods/herdr-signals/addons.js";
import { DECK_MAX_BODY, deckAsks, deckUsage, fitDeck, summary } from "../herdr/mods/herdr-signals/policy.js";

// The deck plugin answers 413 to a report over 4096 bytes (herdr-kit
// streamdeck/src/server.ts MAX_BODY), which freezes every key, and drops an
// agent whose name is over 40 code points (goodName).
const bytes = (o) => Buffer.byteLength(JSON.stringify(o));
const cps = (s) => [...s].length;
const EMOJI = "🐑";

// Every field at its own cap: 8 blocked Claudes with 60-emoji names, a
// permission prompt with emoji detail and description, and a badge whose
// text, short and url are each at their cap.
function worst({ url = true } = {}) {
  const agents = Array.from({ length: 8 }, (_, i) => ({
    address: `t${i}`,
    name: EMOJI.repeat(60),
    status: "blocked",
    card: "permission",
    attention: { since: 1000 + i },
    perm: { tool: "Bash", detail: EMOJI.repeat(500), description: EMOJI.repeat(500) },
  }));
  const usage = { five: { used: 99, reset: "11:59p", over: true }, week: { used: 99, reset: "Sun 11:59p", over: true }, outTime: "11:59p", stale: true, asOf: "11:59p" };
  const badge = {
    text: EMOJI.repeat(5000),
    short: EMOJI.repeat(40),
    url: url ? `https://example.com/${"a".repeat(MAX_DECK_URL - 20)}` : null,
  };
  return { ...summary(agents), asks: deckAsks(agents, "t0"), approve: deckApprove(agents), usage: deckUsage(usage), badge: deckBadge(badge) };
}

test("fitDeck: a report with every field at its cap and long names posts under 4096 bytes, counts intact", () => {
  for (const url of [true, false]) {
    const raw = worst({ url });
    assert.ok(bytes(raw) > DECK_MAX_BODY, `the unfitted report is ${bytes(raw)} bytes`);
    const sent = fitDeck(raw);
    assert.ok(bytes(sent) <= DECK_MAX_BODY, `posted body is ${bytes(sent)} bytes`);
    assert.equal(sent.blocked, 8);
    assert.equal(sent.done, 0);
    assert.equal(sent.top, "t0");
    assert.equal(sent.asks.count, 8);
    assert.ok(sent.approve, "the approve key keeps its offer");
    assert.equal(sent.approve.address, "t0");
    assert.equal(sent.approve.detail, raw.approve.detail, "the prompt keeps its identity");
    assert.equal(sent.agents.length, 5);
    for (const a of sent.agents) assert.ok(cps(a.name) <= 40);
  }
});

test("fitDeck: it drops badge.url first, then the badge, then clips names and drops the description", () => {
  const small = { blocked: 1, done: 0, top: "t1", top_name: "alpha", agents: [{ address: "t1", name: "alpha", kind: "blocked", status: "blocked" }] };
  const url = `https://example.com/${"a".repeat(2000)}`;
  // The url alone tips it over: only the url goes.
  const a = fitDeck({ ...small, badge: { text: "x".repeat(200), url, short: "s" } }, 2100);
  assert.deepEqual(a.badge, { text: "x".repeat(200), url: null, short: "s" });
  assert.equal(a.top_name, "alpha");
  // Without a url to drop, the badge goes before any name is clipped.
  const long = "n".repeat(40);
  const b = fitDeck({ ...small, top_name: long, badge: { text: "x".repeat(200), url: null, short: "s" } }, 200);
  assert.equal(b.badge, null);
  assert.equal(b.top_name, long);
  // Then names are clipped to what the keys show and the description goes;
  // the detail stays whole, since the deck tells prompts apart by it.
  const c = fitDeck({ ...small, top_name: long, agents: [{ ...small.agents[0], name: long }], approve: { address: "t1", name: long, tool: "Bash", detail: "d".repeat(120), since: 1, description: "e".repeat(120) } }, 400);
  assert.ok(cps(c.top_name) <= 10 && c.top_name.endsWith("…"));
  assert.ok(cps(c.agents[0].name) <= 10);
  assert.ok(cps(c.approve.name) <= 10);
  assert.equal(c.approve.detail, "d".repeat(120));
  assert.equal(c.approve.description, undefined);
  assert.equal(c.approve.tool, "Bash");
  assert.ok(bytes(c) <= 400, `${bytes(c)} bytes`);
});

test("fitDeck: a report that already fits is unchanged, except names over the deck's 40", () => {
  const s = { blocked: 1, done: 0, top: "t1", top_name: "alpha", agents: [{ address: "t1", name: "alpha", kind: "blocked", status: "blocked" }], badge: { text: "t", url: "https://example.com", short: null } };
  assert.deepEqual(fitDeck(s), s);
  // The deck refuses a name over 40 code points, so a long one is clipped
  // even when the report fits, and the Claude keeps its tile.
  const long = EMOJI.repeat(41);
  const t = fitDeck({ ...s, top_name: long, agents: [{ ...s.agents[0], name: long }] });
  assert.equal(cps(t.top_name), 40);
  assert.equal(cps(t.agents[0].name), 40);
  assert.ok(t.agents[0].name.endsWith("…"));
});

test("fitDeck: never mutates its input", () => {
  const raw = worst();
  const before = JSON.stringify(raw);
  fitDeck(raw);
  assert.equal(JSON.stringify(raw), before);
});

test("fitDeck: approve's tool and detail are the same whether or not the report was over", () => {
  const raw = worst();
  const calm = fitDeck({ ...raw, badge: null, agents: [] });
  const tight = fitDeck(raw);
  assert.equal(tight.approve.tool, calm.approve.tool);
  assert.equal(tight.approve.detail, calm.approve.detail);
});
