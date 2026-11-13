import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveNames, sanitizeName, initialNamesMemo } from "../herdr/mods/herdr-signals/names.js";

const ag = (address, tab, extra = {}) => ({ address, tab, tab_name: "1", tab_named: false, space_name: "code", ...extra });

// Runs frames [{agents, files, now}] through resolveNames, applying renames to
// the agents' tab names the way Herdr would before the next frame.
function run(frames) {
  let memo = initialNamesMemo();
  let out;
  const renames = [];
  for (const f of frames) {
    out = resolveNames(memo, f);
    memo = out.memo;
    renames.push(...out.renames);
  }
  return { ...out, allRenames: renames };
}

test("file name wins when unnamed", () => {
  const out = run([{ agents: [ag("t1", "A")], files: { t1: { name: "web-app", hint: "Forum recap", at: 10 } }, now: 20 }]);
  assert.deepEqual(out.names.t1, { name: "web-app", hint: "Forum recap", ask: null, menu: null, perm: null, ask_text: null, said: null, card: null, card_at: null, runs: [], tool: null, source: "rename" });
  assert.deepEqual(out.renames, [{ tab: "A", name: "web-app" }]);
});

test("our own tab rename is not mistaken for the user's", () => {
  const files = { t1: { name: "web-app", hint: null, at: 10 } };
  const out = run([
    { agents: [ag("t1", "A")], files, now: 20 },
    { agents: [ag("t1", "A", { tab_name: "web-app", tab_named: true })], files, now: 30 },
  ]);
  assert.equal(out.names.t1.source, "rename");
  assert.deepEqual(out.renames, []);
});

test("the user's tab rename wins when newer than file", () => {
  const files = { t1: { name: "web-app", hint: null, at: 10 } };
  const out = run([
    { agents: [ag("t1", "A")], files, now: 20 },
    { agents: [ag("t1", "A", { tab_name: "plex forum", tab_named: true })], files, now: 30 },
  ]);
  assert.deepEqual(out.names.t1, { name: "plex forum", hint: null, ask: null, menu: null, perm: null, ask_text: null, said: null, card: null, card_at: null, runs: [], tool: null, source: "tab" });
  assert.deepEqual(out.renames, []);
});

test("newer /rename beats older tab rename", () => {
  const out = run([
    { agents: [ag("t1", "A", { tab_name: "mine", tab_named: true })], files: {}, now: 20 },
    { agents: [ag("t1", "A", { tab_name: "mine", tab_named: true })], files: { t1: { name: "web-app", hint: null, at: 25 } }, now: 30 },
  ]);
  assert.equal(out.names.t1.name, "web-app");
  assert.deepEqual(out.renames, [{ tab: "A", name: "web-app" }]);
});

test("split tab is never renamed", () => {
  const files = { t1: { name: "one", hint: null, at: 10 }, t2: { name: "two", hint: null, at: 11 } };
  const out = run([{ agents: [ag("t1", "A"), ag("t2", "A")], files, now: 20 }]);
  assert.equal(out.names.t1.name, "one");
  assert.equal(out.names.t2.name, "two");
  assert.deepEqual(out.allRenames, []);
});

test("fallback without names", () => {
  const out = run([{ agents: [ag("t1", "A", { tab_name: "3" })], files: {}, now: 1 }]);
  assert.deepEqual(out.names.t1, { name: "code · 3", hint: null, ask: null, menu: null, perm: null, ask_text: null, said: null, card: null, card_at: null, runs: [], tool: null, source: "fallback" });
});

test("collision adds space", () => {
  const files = { t1: { name: "fix", hint: null, at: 1 }, t2: { name: "fix", hint: null, at: 1 } };
  const out = run([{ agents: [ag("t1", "A"), ag("t2", "B", { space_name: "web-app" })], files, now: 2 }]);
  assert.equal(out.names.t1.name, "fix · code");
  assert.equal(out.names.t2.name, "fix · web-app");
});

test("sanitizes names", () => {
  assert.equal(sanitizeName("a\u0007b\n  c"), "ab c");
  const long = sanitizeName("x".repeat(200));
  assert.equal(long.length, 40);
  assert.ok(long.endsWith("…"));
  const out = run([{ agents: [ag("t1", "A")], files: { t1: { name: "evil\u001b[31m name", hint: null, at: 1 } }, now: 2 }]);
  assert.equal(out.names.t1.name, "evil[31m name");
});

test("ignores files for unknown terminals", () => {
  const out = run([{ agents: [ag("t1", "A")], files: { t9: { name: "gone", hint: null, at: 1 } }, now: 2 }]);
  assert.deepEqual(Object.keys(out.names), ["t1"]);
});

test("no /rename: Claude's own title names it, no tab rename", () => {
  const out = run([{ agents: [ag("t1", "A")], files: { t1: { name: null, hint: "Some work", at: 1 } }, now: 2 }]);
  assert.deepEqual(out.names.t1, { name: "Some work", hint: null, ask: null, menu: null, perm: null, ask_text: null, said: null, card: null, card_at: null, runs: [], tool: null, source: "fallback" });
  assert.deepEqual(out.renames, []);
});

test("an unrenamed Claude takes the ticket key from its branch", async () => {
  const { branchTicket } = await import("../herdr/mods/herdr-signals/names.js");
  assert.equal(branchTicket("user/acme-2312-retry"), "ACME-2312");
  assert.equal(branchTicket("ACME-4137"), "ACME-4137");
  assert.equal(branchTicket("main"), null);
  assert.equal(branchTicket("release-2"), null);
  const a = ag("t1", "tab1", { branch: "acme-2312-retry" });
  const { names } = resolveNames(initialNamesMemo(), { agents: [a], files: { t1: { name: null, hint: "Kickoff doc", at: 1 } }, now: 2 });
  assert.equal(names.t1.name, "ACME-2312 Kickoff doc");
  assert.equal(names.t1.hint, "Kickoff doc");
  const bare = resolveNames(initialNamesMemo(), { agents: [a], files: {}, now: 2 });
  assert.equal(bare.names.t1.name, "ACME-2312");
});

test("the session's own branch beats the pane folder's branch", () => {
  const a = ag("t1", "tab1", { branch: "feat/ACME-359-thinking" });
  const { names } = resolveNames(initialNamesMemo(), { agents: [a], files: { t1: { name: null, hint: null, branch: "ACME-1949-telemetry", at: 1 } }, now: 2 });
  assert.equal(names.t1.name, "ACME-1949");
});

test("sanitizeName strips bidi and zero-width characters and keeps surrogate pairs whole", () => {
  assert.equal(sanitizeName("a\u202eb\u200bc\ufeffd\u2066e"), "abcde");
  const t = sanitizeName("😀".repeat(100));
  assert.equal(Array.from(t).length, 40);
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(t));
});

test("names: menu, perm and ask_text pass through; junk is null", () => {
  const menu = { questions: [{ header: "Pick", question: "Which?", multi: false, options: [{ label: "A", description: "first" }] }] };
  const good = run([{ agents: [ag("t1", "A")], files: { t1: { name: null, hint: null, at: 1, menu, perm: { tool: "Bash", detail: "ls" }, ask_text: "x?" } }, now: 2 }]);
  assert.deepEqual(good.names.t1.menu, menu);
  assert.deepEqual(good.names.t1.perm, { tool: "Bash", detail: "ls" });
  assert.equal(good.names.t1.ask_text, "x?");
  const junk = run([{ agents: [ag("t1", "A")], files: { t1: { name: null, hint: null, at: 1, menu: "junk", perm: 3, ask_text: 7 } }, now: 2 }]);
  assert.deepEqual([junk.names.t1.menu, junk.names.t1.perm, junk.names.t1.ask_text], [null, null, null]);
  const absent = run([{ agents: [ag("t1", "A")], files: {}, now: 2 }]);
  assert.deepEqual([absent.names.t1.menu, absent.names.t1.perm, absent.names.t1.ask_text], [null, null, null]);
});

test("names: menu drops questions with no options, null when none is left", () => {
  const q = (header, options) => ({ header, question: header, multi: false, options });
  const mixed = run([{ agents: [ag("t1", "A")], files: { t1: { name: null, hint: null, at: 1, menu: { questions: [q("empty", []), q("kept", [{ label: "Y", description: "" }])] } } }, now: 2 }]);
  assert.deepEqual(mixed.names.t1.menu.questions.map((x) => x.header), ["kept"]);
  const none = run([{ agents: [ag("t1", "A")], files: { t1: { name: null, hint: null, at: 1, menu: { questions: [q("empty", [])] } } }, now: 2 }]);
  assert.equal(none.names.t1.menu, null);
});

test("names: perm detail is cut to 300 characters", () => {
  const long = run([{ agents: [ag("t1", "A")], files: { t1: { name: null, hint: null, at: 1, perm: { tool: "Bash", detail: "d".repeat(500) } } }, now: 2 }]);
  assert.equal(long.names.t1.perm.detail.length, 300);
  assert.equal(long.names.t1.perm.tool, "Bash");
});

test("names: perm keeps a description, capped, and drops a non-string one", () => {
  const run1 = (perm) => run([{ agents: [ag("t1", "A")], files: { t1: { name: null, hint: null, at: 1, perm }, }, now: 2 }]).names.t1.perm;
  assert.deepEqual(run1({ tool: "Bash", detail: "ls", description: "List" }), { tool: "Bash", detail: "ls", description: "List" });
  assert.deepEqual(run1({ tool: "Bash", detail: "ls", description: 5 }), { tool: "Bash", detail: "ls" });
  assert.equal(Array.from(run1({ tool: "Bash", detail: "ls", description: "d".repeat(900) }).description).length, 300);
});
