import { test } from "node:test";
import assert from "node:assert/strict";
import { deckApprove, APPROVE_DETAIL_MAX } from "../herdr/mods/herdr-signals/approve.js";

const row = (address, o = {}) => ({
  address, name: address.toUpperCase(), status: "blocked", snoozed: false,
  perm: { tool: "Bash", detail: "npm test" }, attention: { kind: "blocked", since: 1000 }, ...o,
});

test("deckApprove is null with nothing pending", () => {
  assert.equal(deckApprove([]), null);
  assert.equal(deckApprove([row("t1", { perm: null }), row("t2", { status: "working" })]), null);
});

test("deckApprove picks the oldest blocked Claude with a permission prompt", () => {
  const a = deckApprove([row("t1", { attention: { kind: "blocked", since: 5000 } }), row("t2", { attention: { kind: "blocked", since: 2000 } })]);
  assert.deepEqual(a, { address: "t2", name: "T2", tool: "Bash", detail: "npm test", since: 2000 });
});

test("deckApprove ties go to rail order", () => {
  assert.equal(deckApprove([row("t1"), row("t2")]).address, "t1");
});

test("deckApprove leaves out snoozed, remote, non-blocked and menu-only Claudes", () => {
  const rows = [
    row("t1", { snoozed: true }),
    row("vps/t7"),
    row("t3", { status: "done" }),
    row("t4", { perm: null, menu: { questions: [] } }),
    row("t5", { attention: { kind: "blocked", since: 9000 } }),
  ];
  assert.equal(deckApprove(rows).address, "t5");
  assert.equal(deckApprove(rows, ["t5"]), null);
});

test("deckApprove clips a long detail and flattens whitespace", () => {
  const a = deckApprove([row("t1", { perm: { tool: "Bash", detail: `a\n  b ${"x".repeat(500)}` } })]);
  assert.equal([...a.detail].length, APPROVE_DETAIL_MAX);
  assert.ok(a.detail.startsWith("a b x"));
});

test("deckApprove since is null when unknown", () => {
  assert.equal(deckApprove([row("t1", { attention: { kind: "blocked", since: null } })]).since, null);
});

test("deckApprove clips a long name to 40 code points", () => {
  assert.equal([...deckApprove([row("t1", { name: "n".repeat(60) })]).name].length, 40);
});

test("deckApprove passes the recorded description through, only when there is one", () => {
  const a = deckApprove([row("t1", { perm: { tool: "Bash", detail: "npm test", description: "Run tests" } })]);
  assert.equal(a.description, "Run tests");
  assert.equal("description" in deckApprove([row("t1")]), false);
  assert.equal(deckApprove([row("t1", { perm: { tool: "Bash", detail: "x", description: "  " } })]).description, undefined);
});
