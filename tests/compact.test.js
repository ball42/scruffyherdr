import { test } from "node:test";
import assert from "node:assert/strict";
import "./support/gpui-stub.js";

const { canCompact, compactPill } = await import("../herdr/mods/kit-rail/look.js");
const { sendCompact } = await import("../herdr/mods/kit-rail/answer.js");

const T = { muted: "#888", foreground: "#ccc", border: "#444", hover: "#333", dim: "#777" };
const claude = (status, ctx_left, address = "1:2") => ({ address, status, ctx_left });
const call = (el, name) => el.calls.find((c) => c[0] === name)?.slice(1);

test("canCompact: shows for a done or idle Claude at critical context", () => {
  assert.equal(canCompact(claude("done", 15)), true);
  assert.equal(canCompact(claude("idle", 3)), true);
  assert.equal(canCompact(claude("done", 0)), true);
});

test("canCompact: never for a working or blocked Claude", () => {
  assert.equal(canCompact(claude("working", 5)), false);
  assert.equal(canCompact(claude("blocked", 5)), false);
});

test("canCompact: not above critical, without data, or for a remote Claude", () => {
  assert.equal(canCompact(claude("done", 16)), false);
  assert.equal(canCompact(claude("done", 60)), false);
  assert.equal(canCompact(claude("done", null)), false);
  assert.equal(canCompact(claude("done", 5, "host/1:2")), false);
  assert.equal(canCompact(null), false);
});

test("compactPill: a pill with the id and label; the click runs the action", () => {
  let ran = 0, stopped = 0;
  const el = compactPill(T, claude("done", 5), false, () => ran++);
  assert.equal(call(el, "id")[0], "rail-compact-1:2");
  assert.ok(el.calls.some((c) => c[0] === "child" && c[1] === "⟲ compact"));
  call(el, "on_click")[0]({}, { stop_propagation: () => stopped++ });
  assert.equal(ran, 1);
  assert.equal(stopped, 1);
});

test("compactPill: while sending it is plain 'sending…' text with no click", () => {
  const el = compactPill(T, claude("done", 5), true, () => assert.fail("no click"));
  assert.ok(el.calls.some((c) => c[0] === "child" && c[1] === "sending…"));
  assert.equal(call(el, "on_click"), undefined);
});

// A fake hc: status reads return `status()`; sends are recorded.
function fakeHc(statuses) {
  const sent = [];
  let reads = 0;
  const h = {
    sleep: async () => {},
    hc: async (args) => {
      if (args[0] === "get") {
        const s = statuses[Math.min(reads++, statuses.length - 1)];
        return { code: 0, stdout: JSON.stringify({ status: s }), stderr: "" };
      }
      sent.push(args);
      return { code: 0, stdout: "", stderr: "" };
    },
  };
  return { h, sent };
}

test("sendCompact: sends /compact as a rail reply, then reports sent once the status moves", async () => {
  const { h, sent } = fakeHc([{ state: "done", kind: "x", msg: "m" }, { state: "done", kind: "x", msg: "m" }, { state: "working", kind: "x", msg: "" }]);
  assert.equal(await sendCompact("1:2", h), "sent");
  assert.deepEqual(sent, [["send", "1:2", "/compact"]]);
});

test("sendCompact: unreadable status sends nothing", async () => {
  const h = { sleep: async () => {}, hc: async () => ({ code: 1, stdout: "", stderr: "" }) };
  assert.equal(await sendCompact("1:2", h), "failed");
});
