import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { latestTitles } from "../claude/titles.js";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "..", "claude", "name-hook.mjs");
const custom = (t) => JSON.stringify({ type: "custom-title", customTitle: t, sessionId: "s1" });
const ai = (t) => JSON.stringify({ type: "ai-title", aiTitle: t, sessionId: "s1" });

function runHook(env, transcriptLines) {
  const home = env.HOME;
  const transcript = join(home, "t.jsonl");
  writeFileSync(transcript, transcriptLines.join("\n") + "\n");
  const input = JSON.stringify({ session_id: "s1", transcript_path: transcript });
  return spawnSync(process.execPath, [HOOK], { input, env: { PATH: process.env.PATH, ...env } });
}

test("latest custom and ai titles win", () => {
  assert.deepEqual(latestTitles([custom("a"), ai("x"), custom("b")].join("\n")), { custom: "b", ai: "x" });
});

test("malformed lines are skipped", () => {
  assert.deepEqual(latestTitles([custom("a"), "{nope", ai("x")].join("\n")), { custom: "a", ai: "x" });
});

test("no titles", () => {
  assert.deepEqual(latestTitles('{"type":"user"}\n'), { custom: null, ai: null });
});

test("hook no-ops outside Herdr", () => {
  const home = mkdtempSync(join(tmpdir(), "hk-"));
  const r = runHook({ HOME: home }, [custom("x")]);
  assert.equal(r.status, 0);
  assert.equal(existsSync(join(home, ".config/herdr-kit/names")), false);
});

test("writes the names file", () => {
  const home = mkdtempSync(join(tmpdir(), "hk-"));
  const r = runHook({ HOME: home, HC_TERMINAL_ID: "t3" }, [ai("Seeding work"), custom("score-board seeding")]);
  assert.equal(r.status, 0);
  const f = JSON.parse(readFileSync(join(home, ".config/herdr-kit/names/t3.json"), "utf8"));
  assert.equal(f.name, "score-board seeding");
  assert.equal(f.hint, "Seeding work");
  assert.equal(f.session_id, "s1");
  assert.equal(typeof f.at, "number");
});

test("keeps previous name when tail has no title", () => {
  const home = mkdtempSync(join(tmpdir(), "hk-"));
  const dir = join(home, ".config/herdr-kit/names");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "t3.json"), JSON.stringify({ name: "old", hint: null, session_id: "s1", at: 1 }));
  runHook({ HOME: home, HC_TERMINAL_ID: "t3" }, [ai("New hint")]);
  const f = JSON.parse(readFileSync(join(dir, "t3.json"), "utf8"));
  assert.equal(f.name, "old");
  assert.equal(f.hint, "New hint");
});

test("hook survives garbage input", () => {
  const home = mkdtempSync(join(tmpdir(), "hk-"));
  const r = spawnSync(process.execPath, [HOOK], { input: "not json", env: { PATH: process.env.PATH, HOME: home, HC_TERMINAL_ID: "t3" } });
  assert.equal(r.status, 0);
});

test("finds an old /rename beyond the tail on first sight", () => {
  const home = mkdtempSync(join(tmpdir(), "hk-"));
  const filler = JSON.stringify({ type: "assistant", text: "x".repeat(1000) });
  runHook({ HOME: home, HC_TERMINAL_ID: "t3" }, [custom("long-lived"), ...Array(700).fill(filler), ai("Recent hint")]);
  const f = JSON.parse(readFileSync(join(home, ".config/herdr-kit/names/t3.json"), "utf8"));
  assert.equal(f.name, "long-lived");
  assert.equal(f.hint, "Recent hint");
});

