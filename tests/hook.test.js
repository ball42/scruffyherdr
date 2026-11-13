import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeAsk, summarizeTool, truncate } from "../claude/titles.js";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "..", "claude", "name-hook.mjs");
const lone = /[\ud800-\udbff](?![\udc00-\udfff])/;

function setup(lines = []) {
  const home = mkdtempSync(join(tmpdir(), "hk-"));
  const transcript = join(home, "t.jsonl");
  writeFileSync(transcript, lines.join("\n") + "\n");
  const names = join(home, ".config", "herdr-kit", "names");
  const run = (event, extra = {}) =>
    spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ hook_event_name: event, session_id: "s1", transcript_path: transcript, ...extra }),
      env: { PATH: process.env.PATH, HOME: home, HC_TERMINAL_ID: "t1" },
    });
  const read = () => JSON.parse(readFileSync(join(names, "t1.json"), "utf8"));
  return { home, names, run, read, transcript };
}

test("summarizeAsk picks the first field, squashes and cuts at 80", () => {
  assert.equal(summarizeAsk("Bash", { command: "curl  -sI\n https://example.com" }), "Bash: curl -sI https://example.com");
  assert.equal(summarizeAsk("WebFetch", { url: "https://x.dev" }), "WebFetch: https://x.dev");
  assert.equal(summarizeAsk("Mystery", {}), "Mystery");
  assert.equal(summarizeAsk("AskUserQuestion", { questions: [{ question: "How should\n these fit?" }, { question: "b" }] }), "How should these fit?");
  assert.equal(summarizeAsk("AskUserQuestion", { questions: [] }), "AskUserQuestion");
  const t = summarizeAsk("Bash", { command: "x".repeat(200) });
  assert.equal(Array.from(t).length, 80);
  assert.ok(t.endsWith("…"));
});

test("summarizeTool uses basenames and a 40-char command", () => {
  assert.equal(summarizeTool("Edit", { file_path: "/a/b/grid.js" }), "Edit grid.js");
  assert.equal(summarizeTool("Bash", { command: "npm test" }), "Bash: npm test");
  assert.equal(summarizeTool("Bash", { command: "y".repeat(100) }), `Bash: ${"y".repeat(40)}`);
  assert.equal(summarizeTool("Grep", { pattern: "x" }), "Grep");
  assert.ok(Array.from(summarizeTool("Read", { file_path: "/" + "f".repeat(100) })).length <= 60);
});

test("truncate never splits a surrogate pair", () => {
  const t = truncate("😀".repeat(100), 5);
  assert.equal(t, "😀😀😀😀…");
  assert.ok(!lone.test(t));
});

test("PermissionRequest sets ask; PreToolUse clears it and sets tool", () => {
  const h = setup();
  h.run("SessionStart");
  h.run("PermissionRequest", { tool_name: "Bash", tool_input: { command: "curl -sI https://example.com" } });
  assert.equal(h.read().ask.text, "Bash: curl -sI https://example.com");
  h.run("PreToolUse", { tool_name: "Edit", tool_input: { file_path: "/x/grid.js" } });
  const f = h.read();
  assert.equal(f.ask, null);
  assert.equal(f.tool.text, "Edit grid.js");
});

test("PermissionRequest records a Bash description in perm, and only for Bash", () => {
  const h = setup();
  h.run("SessionStart");
  h.run("PermissionRequest", { tool_name: "Bash", tool_input: { command: "npm test", description: "Run tests" } });
  assert.deepEqual(h.read().perm, { tool: "Bash", detail: "npm test", description: "Run tests" });
  h.run("PermissionRequest", { tool_name: "Bash", tool_input: { command: "ls" } });
  assert.deepEqual(h.read().perm, { tool: "Bash", detail: "ls" });
  h.run("PermissionRequest", { tool_name: "Write", tool_input: { file_path: "/a/b.js", description: "x" } });
  assert.deepEqual(h.read().perm, { tool: "Write", detail: "/a/b.js" });
});

test("Stop clears tool and ask", () => {
  const h = setup([JSON.stringify({ type: "user" })]);
  h.run("PreToolUse", { tool_name: "Bash", tool_input: { command: "ls" } });
  h.run("Stop");
  const f = h.read();
  assert.equal(f.tool, null);
  assert.equal(f.ask, null);
});

test("SessionStart deletes names files older than 7 days, keeps the current one", () => {
  const h = setup();
  mkdirSync(h.names, { recursive: true });
  const old = join(h.names, "old.json");
  const cur = join(h.names, "t1.json");
  const fresh = join(h.names, "fresh.json");
  for (const p of [old, cur, fresh]) writeFileSync(p, "{}");
  const past = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  utimesSync(old, past, past);
  utimesSync(cur, past, past);
  h.run("SessionStart");
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(fresh), true);
  assert.equal(existsSync(cur), true);
});

test("a surrogate pair is never split in the hook text", () => {
  const h = setup();
  h.run("PermissionRequest", { tool_name: "Bash", tool_input: { command: "😀".repeat(100) } });
  const text = h.read().ask.text;
  assert.equal(Array.from(text).length, 80);
  assert.ok(!lone.test(text));
});

test("gitBranch reads the branch from a repo and from a worktree", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { gitBranch } = await import("../claude/git.js");
  const root = mkdtempSync(join(tmpdir(), "gb-"));
  mkdirSync(join(root, "repo/.git/worktrees/wt"), { recursive: true });
  mkdirSync(join(root, "repo/sub"), { recursive: true });
  mkdirSync(join(root, "wt"));
  writeFileSync(join(root, "repo/.git/HEAD"), "ref: refs/heads/feat/ACME-359\n");
  writeFileSync(join(root, "repo/.git/worktrees/wt/HEAD"), "ref: refs/heads/ACME-1949-x\n");
  writeFileSync(join(root, "wt/.git"), `gitdir: ${join(root, "repo/.git/worktrees/wt")}\n`);
  assert.equal(gitBranch(join(root, "repo/sub")), "feat/ACME-359");
  assert.equal(gitBranch(join(root, "wt")), "ACME-1949-x");
  assert.equal(gitBranch(root), null);
});
