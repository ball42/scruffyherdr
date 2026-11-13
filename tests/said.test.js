// The rail's peek at a done Claude's last reply: the hook's lastSaid parser,
// the names file and model plumbing, and the rail's saidLines / saidGist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lastSaid } from "../claude/cards.js";
import { initialNamesMemo, resolveNames } from "../herdr/mods/herdr-signals/names.js";
import { attentionStep, buildModel } from "../herdr/mods/herdr-signals/model.js";
import { saidGist, saidLines } from "../herdr/mods/kit-rail/answer.js";

const F = "```";
const HOOK = join(dirname(fileURLToPath(import.meta.url)), "..", "claude", "name-hook.mjs");

const REPLY = [
  "## Done",
  "",
  "Merged **PR #70**: the rail now shows `said` on done cards.",
  "It reads the [README](https://x.dev/readme) first.",
  "",
  "- tests pass",
  "- installed",
  "",
  `${F}sh`,
  "npm test",
  F,
  "",
  "| a | b |",
  "|---|---|",
  "",
  "---",
  "",
  "## Your action items",
  "",
  "**▶ Run:** pull",
  "",
  `${F}sh`,
  "git pull",
  F,
].join("\n");

test("lastSaid: prose before the action items, plain, one line per paragraph or item", () => {
  assert.equal(lastSaid(REPLY), [
    "Done",
    "Merged PR #70: the rail now shows said on done cards. It reads the README first.",
    "• tests pass",
    "• installed",
  ].join("\n"));
});

test("lastSaid: null when only code or action items are left; cut at 600", () => {
  assert.equal(lastSaid(`${F}sh\nls\n${F}`), null);
  assert.equal(lastSaid("## Your action items\n\n**? Ask:** which box?"), null);
  assert.equal(lastSaid(""), null);
  const long = lastSaid("word ".repeat(400));
  assert.equal(Array.from(long).length, 600);
  assert.ok(long.endsWith("…"));
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(lastSaid("😀".repeat(700))));
});

function hook() {
  const home = mkdtempSync(join(tmpdir(), "hk-said-"));
  const transcript = join(home, "t.jsonl");
  writeFileSync(transcript, "\n");
  const run = (event, extra = {}) => spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: event, session_id: "s1", transcript_path: transcript, ...extra }),
    env: { PATH: process.env.PATH, HOME: home, HC_TERMINAL_ID: "t1" },
  });
  const read = () => JSON.parse(readFileSync(join(home, ".config", "herdr-kit", "names", "t1.json"), "utf8"));
  return { run, read };
}

test("hook: Stop writes said, a tool call keeps it, a real prompt clears it", () => {
  const h = hook();
  h.run("Stop", { last_assistant_message: "All green.\n\nShipped it." });
  assert.equal(h.read().said, "All green.\nShipped it.");
  h.run("PreToolUse", { tool_name: "Bash", tool_input: { command: "ls" } });
  assert.equal(h.read().said, "All green.\nShipped it.");
  h.run("UserPromptSubmit", { prompt: "[herdr-kit] ▶ Run finished: \"x\" exited 0. Output: /tmp/x.log" });
  assert.equal(h.read().said, "All green.\nShipped it.");
  h.run("UserPromptSubmit", { prompt: "next thing" });
  assert.equal(h.read().said, null);
});

const ag = (address) => ({ address, tab: "tab1", tab_name: "1", tab_named: false, space_name: "P" });

test("names: said passes through, capped at 600; junk or blank is null", () => {
  const one = (f) => resolveNames(initialNamesMemo(), { agents: [ag("t1")], files: { t1: { name: null, hint: null, at: 1, ...f } }, now: 2 }).names.t1.said;
  assert.equal(one({ said: "hi" }), "hi");
  assert.equal(Array.from(one({ said: "x".repeat(900) })).length, 600);
  assert.equal(one({ said: 7 }), null);
  assert.equal(one({ said: "  " }), null);
  assert.equal(one({}), null);
});

test("model: said only while done or idle", () => {
  const pick = (status) => {
    const a = { address: "a", tab: "t", space: "s1", space_name: "P", status, seq: 0, focused: false };
    return buildModel([a], { a: { name: "A", hint: null, said: "Shipped." } }, attentionStep({}, [a], 1), "s1").agents[0].said;
  };
  assert.deepEqual(["done", "idle", "blocked", "working"].map(pick), ["Shipped.", "Shipped.", null, null]);
});

test("saidLines: drops the closing question the reply box shows; only done or idle", () => {
  const a = { status: "done", attention: { kind: "done" }, said: "Fixed the strip.\nWant me to merge it?", ask_text: "Want me to **merge** it?" };
  assert.deepEqual(saidLines(a), ["Fixed the strip."]);
  assert.deepEqual(saidLines({ ...a, ask_text: null }), ["Fixed the strip.", "Want me to merge it?"]);
  assert.deepEqual(saidLines({ ...a, status: "working" }), []);
  assert.deepEqual(saidLines({ ...a, said: null }), []);
});

test("saidGist: the first paragraph, on a done card only", () => {
  const a = { status: "done", attention: { kind: "done" }, said: "Fixed the strip.\nWant me to merge it?", ask_text: "Want me to merge it?" };
  assert.equal(saidGist(a), "Fixed the strip.");
  assert.equal(saidGist({ ...a, said: "Want me to merge it?" }), "Want me to merge it?");
  assert.equal(saidGist({ ...a, attention: { kind: null } }), null);
  assert.equal(saidGist({ ...a, said: null }), null);
});
