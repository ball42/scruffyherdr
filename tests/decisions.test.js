// Each rail answer leaves a line in ~/.config/herdr-kit/decisions/<date>.jsonl.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DECISIONS_DIR, appendLine, dayKey, decisionLine, decisionOf, decisionPath, parseDecisions, recordDecision } from "../herdr/mods/kit-rail/decisions.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const opts = (...l) => l.map((label) => ({ label, description: "" }));
const AT = new Date(2026, 10, 23, 9, 41).getTime();

test("dayKey and decisionPath: the local date, under ~/.config/herdr-kit/decisions", () => {
  assert.equal(dayKey(AT), "2026-11-23");
  assert.equal(DECISIONS_DIR, ".config/herdr-kit/decisions");
  assert.equal(decisionPath("/home/x", AT), "/home/x/.config/herdr-kit/decisions/2026-11-23.jsonl");
});

test("decisionOf: a permission, by the option picked; a Deny with its reason", () => {
  const perm = { deny: 3, options: [{ n: 1, label: "Yes" }, { n: 2, label: "Yes, always" }, { n: 3, label: "No" }] };
  const a = { perm: { tool: "Bash", detail: "npm test" } };
  assert.deepEqual(decisionOf("permission", a, { perm, permPick: 1 }), { kind: "permission", question: "Bash: npm test", answer: "Yes" });
  assert.deepEqual(decisionOf("permission", a, { perm, permPick: 3 }, " not now "), { kind: "permission", question: "Bash: npm test", answer: "No: not now" });
  assert.equal(decisionOf("permission", {}, { perm, permPick: 1, shown: { msg: "approve Edit: x.js" } }).question, "approve Edit: x.js");
  assert.equal(decisionOf("permission", a, { perm, permPick: null }), null);
});

test("decisionOf: a menu, each question's picks (Other as typed), joined", () => {
  const menu = { questions: [
    { header: "Deploy", question: "Deploy now?", multi: false, options: opts("Now", "Later") },
    { header: "Parts", question: "Which parts?", multi: true, options: opts("api", "web") },
  ] };
  const o = { answers: [{ picks: [2], other: "" }, { picks: [1, 3], other: "docs" }] };
  assert.deepEqual(decisionOf("menu", { menu }, o), { kind: "menu", question: "Deploy now? · Which parts?", answer: "Later · api, docs" });
  assert.equal(decisionOf("menu", { menu }, { answers: [] }), null);
});

test("decisionOf: a reply, against the question it answers; long text is cut", () => {
  assert.deepEqual(decisionOf("reply", { ask_text: "Which box?" }, {}, "the mini"), { kind: "reply", question: "Which box?", answer: "the mini" });
  assert.equal(decisionOf("reply", { ask_text: "q" }, {}, "  "), null);
  const long = decisionOf("reply", { ask_text: "q" }, {}, "x".repeat(400)).answer;
  assert.equal(long.length, 300);
  assert.ok(long.endsWith("…"));
});

test("decisionLine and parseDecisions round-trip; bad lines are skipped, oldest first", () => {
  const d = { kind: "reply", question: "Which box?", answer: "the mini" };
  const text = decisionLine(d, "Lamp Post", AT + 60000) + "not json\n" + '{"at":"x","kind":"reply","answer":"a"}\n'
    + '{"at":1,"kind":"shrug","answer":"a"}\n' + decisionLine({ kind: "menu", question: "q", answer: "Now" }, "", AT);
  assert.deepEqual(parseDecisions(text), [
    { at: AT, name: "Claude", kind: "menu", question: "q", answer: "Now" },
    { at: AT + 60000, name: "Lamp Post", kind: "reply", question: "Which box?", answer: "the mini" },
  ]);
  assert.deepEqual(parseDecisions(null), []);
});

test("appendLine keeps each record on its own line", () => {
  assert.equal(appendLine(null, "b\n"), "b\n");
  assert.equal(appendLine("a\n", "b\n"), "a\nb\n");
  assert.equal(appendLine("a", "b\n"), "a\nb\n");
});

test("recordDecision: makes the folder, appends, retries once on a clash, never rejects", async () => {
  const files = {};
  const execs = [];
  let clash = 1;
  const io = {
    home: "/h",
    exec: async (c, args) => { execs.push([c, ...args]); return { code: 0 }; },
    readTextFile: async (p) => files[p] ?? null,
    writeTextFile: async (p, text, expected) => {
      if (clash-- > 0) { files[p] = '{"at":1,"kind":"reply","answer":"other"}\n'; throw new Error("stale"); }
      if ((files[p] ?? null) !== expected) throw new Error("stale");
      files[p] = text;
      return null;
    },
  };
  const d = { kind: "reply", question: "q", answer: "yes" };
  assert.equal(await recordDecision(d, "Tide Clock", AT, io), true);
  assert.deepEqual(execs, [["mkdir", "-p", "/h/.config/herdr-kit/decisions"]]);
  assert.deepEqual(parseDecisions(files["/h/.config/herdr-kit/decisions/2026-11-23.jsonl"]).map((x) => x.answer), ["other", "yes"]);
  assert.equal(await recordDecision(d, "x", AT, { ...io, exec: async () => { throw new Error("no"); } }), false);
  assert.equal(await recordDecision(null, "x", AT, io), false);
});

test("the rail records each answer it sent: one card, and a reply sent to several", () => {
  const expand = readFileSync(join(HERE, "..", "herdr", "mods", "kit-rail", "expand.js"), "utf8");
  const multi = readFileSync(join(HERE, "..", "herdr", "mods", "kit-rail", "multi-ui.js"), "utf8");
  assert.match(expand, /decisionOf\(kind, a, o, /);
  assert.match(expand, /recordDecision\(d, name, Date\.now\(\), \{ home: home\(\), exec, readTextFile, writeTextFile \}\)/);
  assert.match(expand, /if \(res === "sent"\) \{ logDecision\(decided, who\); \}/);
  assert.match(expand, /if \(!d \|\| checking\(\)\) return;/, "never written during Herdr's check");
  assert.match(multi, /if \(res === "sent" && a\) logDecision\(decisionOf\("reply", a, \{\}, text\), a\.name\)/);
});
