import { test } from "node:test";
import assert from "node:assert/strict";
import "./support/gpui-stub.js";

const { div } = await import("gpui-kit");
const { canTick, pruneSelection, toggleSelection, buildQueue, resultOf, runQueue, tickBox, resultChip, multiBar } =
  await import("../herdr/mods/kit-rail/multi.js");
const { promptKey, sendReply } = await import("../herdr/mods/kit-rail/answer.js");

const T = { muted: "#888", foreground: "#ccc", border: "#444", hover: "#333", dim: "#777", raised: "#222", background: "#111" };
const ag = (address, status, ask_text = "ok?") => ({ address, status, ask_text });
const call = (el, name) => el.calls.find((c) => c[0] === name)?.slice(1);
// Every string a stub element and its descendants were given.
function flat(el) {
  const out = [];
  const walk = (v) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object" && v.calls) v.calls.forEach((c) => c.slice(1).forEach(walk));
  };
  walk(el);
  return out.join("|");
}
const kids = (el) => el.calls.filter((c) => c[0] === "child").map((c) => c[1]);

test("canTick: done or idle and local only", () => {
  assert.equal(canTick(ag("1:1", "done")), true);
  assert.equal(canTick(ag("1:1", "idle")), true);
  assert.equal(canTick(ag("1:1", "blocked")), false);
  assert.equal(canTick(ag("1:1", "working")), false);
  assert.equal(canTick(ag("box/1:1", "done")), false);
  assert.equal(canTick(null), false);
});

test("pruneSelection: drops gone, working, blocked and remote; keeps order; reports change", () => {
  const agents = [ag("a", "done"), ag("b", "working"), ag("c", "idle"), ag("d", "blocked")];
  assert.deepEqual(pruneSelection(["c", "a", "b", "d", "zz"], agents), { sel: ["c", "a"], changed: true });
  assert.equal(pruneSelection(["a", "c"], agents).changed, false);
  assert.deepEqual(pruneSelection(undefined, agents), { sel: [], changed: false });
  assert.deepEqual(pruneSelection(["a", "a"], agents).sel, ["a"]);
});

test("toggleSelection adds and removes", () => {
  assert.deepEqual(toggleSelection(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleSelection(["a", "b"], "a"), ["b"]);
  assert.deepEqual(toggleSelection(null, "a"), ["a"]);
});

test("buildQueue: tick order, tick-time key, current key as fallback", () => {
  const agents = [ag("a", "done", "q1"), ag("b", "idle", "q2")];
  const q = buildQueue(["b", "a"], agents, { a: "old" });
  assert.deepEqual(q, [{ address: "b", key: promptKey(agents[1]) }, { address: "a", key: "old" }]);
});

test("resultOf maps sendAnswer results", () => {
  assert.equal(resultOf("sent"), "sent");
  assert.equal(resultOf("moved"), "changed");
  assert.equal(resultOf("stuck"), "stuck");
  assert.equal(resultOf("failed"), "failed");
});

test("runQueue: one after another, per-Claude results, changed ones skipped", async () => {
  const agents = [ag("a", "done", "q"), ag("b", "done", "q"), ag("c", "done", "q"), ag("d", "done", "q")];
  const queue = buildQueue(["a", "b", "c", "d"], agents);
  // b started working since the tick; c's question changed.
  const now = [ag("a", "done", "q"), ag("b", "working", "q"), ag("c", "done", "new"), ag("d", "done", "q")];
  const order = [];
  const seen = [];
  let busy = false;
  const out = await runQueue({
    queue, text: "continue", agents: () => now,
    send: async (addr) => {
      assert.equal(busy, false, "never two at once");
      busy = true;
      order.push(addr);
      await Promise.resolve();
      busy = false;
      return addr === "d" ? "stuck" : "sent";
    },
    onResult: (r) => seen.push({ ...r }),
  });
  assert.deepEqual(order, ["a", "d"]);
  assert.deepEqual(out, { a: "sent", b: "changed", c: "changed", d: "stuck" });
  assert.equal(seen[0].a, "sending");
  assert.ok(seen.some((r) => r.a === "sent" && r.d === undefined));
});

test("runQueue: a send that throws is didn't send, and the rest still go", async () => {
  const agents = [ag("a", "done"), ag("b", "done")];
  const out = await runQueue({
    queue: buildQueue(["a", "b"], agents), text: "yes", agents: () => agents,
    send: async (addr) => { if (addr === "a") throw new Error("x"); return "sent"; },
  });
  assert.deepEqual(out, { a: "failed", b: "sent" });
});

test("runQueue: empty text sends nothing", async () => {
  const out = await runQueue({ queue: [{ address: "a", key: null }], text: "  ", agents: () => [ag("a", "done")], send: () => assert.fail("no") });
  assert.deepEqual(out, {});
});

test("sendReply: types the reply through the single-reply path", async () => {
  const sent = [];
  const h = {
    sleep: async () => {},
    hc: async (args) => {
      if (args[0] === "get") return { code: 0, stdout: JSON.stringify({ status: { state: sent.length ? "working" : "done", msg: "m" } }), stderr: "" };
      sent.push(args);
      return { code: 0, stdout: "", stderr: "" };
    },
  };
  assert.equal(await sendReply("1:2", "continue", h), "sent");
  assert.deepEqual(sent, [["send", "1:2", "continue"]]);
});

test("tickBox: id, empty or ticked glyph, click toggles without reaching the card", () => {
  let got = null, stopped = 0;
  const off = tickBox(T, "1:2", false, (a) => { got = a; });
  assert.equal(call(off, "id")[0], "multi-tick-1:2");
  assert.deepEqual(kids(off), ["☐"]);
  call(off, "on_click")[0]({}, { stop_propagation: () => stopped++ });
  assert.equal(got, "1:2");
  assert.equal(stopped, 1);
  assert.deepEqual(kids(tickBox(T, "1:2", true, () => {})), ["☑"]);
});

test("resultChip: the words per state", () => {
  assert.deepEqual(kids(resultChip(T, "a", "sending")), ["sending…"]);
  assert.deepEqual(kids(resultChip(T, "a", "sent")), ["sent"]);
  assert.deepEqual(kids(resultChip(T, "a", "failed")), ["didn't send"]);
  assert.deepEqual(kids(resultChip(T, "a", "stuck")), ["sent?"]);
  assert.deepEqual(kids(resultChip(T, "a", "changed")), ["changed"]);
});

test("multiBar: count, field, quick buttons, send and clear", () => {
  const field = div();
  const sent = [];
  let cleared = 0;
  const bar = multiBar(T, { n: 3, field, running: null, hasText: true, send: (q) => sent.push(q), clear: () => cleared++ });
  assert.equal(call(bar, "id")[0], "multi-bar");
  const f = flat(bar);
  assert.match(f, /3 selected/);
  assert.match(f, /multi-field/);
  assert.match(f, /send to 3/);
  assert.match(f, /multi-q-continue/);
  assert.match(f, /multi-q-yes/);
});

test("multiBar: while running, no clear or quick pills", () => {
  const field = div();
  const bar = multiBar(T, { n: 2, field, running: { done: 1, total: 2 }, hasText: true, send: () => assert.fail("no"), clear: () => {} });
  const f = flat(bar);
  assert.doesNotMatch(f, /multi-clear|multi-q-/);
  assert.match(f, /sending… 1\/2/);
});
