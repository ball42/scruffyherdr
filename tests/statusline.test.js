import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { backupTo, rewrapStatusLine, shouldWrap, statusLineState, unwrapStatusLine, wrapStatusLine, wrapperCommand, wrapperDir } from "../scripts/merge-config.js";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRAPPER = join(KIT, "claude", "statusline.mjs");
const TRICKY = { type: "command", command: `bash -c 'echo "hi there"' && printf '%s' "$X" # \\ ok`, padding: 0, refreshInterval: 5 };

// run <home> <prev statusLine or null or undefined (no file)> <stdin>
function run(home, prev, input, env = {}) {
  if (prev !== undefined) {
    mkdirSync(join(home, ".config", "herdr-kit"), { recursive: true });
    writeFileSync(join(home, ".config", "herdr-kit", "statusline-prev.json"), JSON.stringify({ statusLine: prev }));
  }
  return spawnSync(process.execPath, [WRAPPER], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    env: { ...process.env, HOME: home, HC_TERMINAL_ID: "t1", ...env },
    encoding: "utf8",
    timeout: 20000,
    maxBuffer: 64 * 1024 * 1024,
  });
}
const home = () => mkdtempSync(join(tmpdir(), "statusline-"));

test("wrap points statusLine at the wrapper and returns the old line", () => {
  const { settings, prev } = wrapStatusLine({ model: "x", statusLine: TRICKY }, "node", "/My Repos/kit");
  assert.equal(settings.statusLine.type, "command");
  assert.equal(settings.statusLine.command, 'node "/My Repos/kit/claude/statusline.mjs"');
  assert.deepEqual(prev, TRICKY);
  assert.equal(settings.model, "x");
  // Only type, command and padding: the old line's other fields stay in prev.
  assert.deepEqual(settings.statusLine, { type: "command", command: 'node "/My Repos/kit/claude/statusline.mjs"', padding: 0 });
  assert.deepEqual(wrapStatusLine({ statusLine: { type: "command", command: "x" } }, "node", "/k").settings.statusLine,
    { type: "command", command: 'node "/k/claude/statusline.mjs"' });
});

test("wrap then unwrap round-trips a command with quotes and &&, byte for byte", () => {
  const before = { model: "x", statusLine: TRICKY, hooks: {} };
  const { settings, prev } = wrapStatusLine(before, "node", "/kit");
  const after = unwrapStatusLine(settings, prev);
  assert.equal(JSON.stringify(after, null, 2), JSON.stringify(before, null, 2));
});

test("wrap with no status line before: prev is null, and unwrap deletes the line", () => {
  const { settings, prev } = wrapStatusLine({ model: "x" }, "node", "/kit");
  assert.equal(prev, null);
  assert.deepEqual(unwrapStatusLine(settings, prev), { model: "x" });
});

test("wrapping twice is a no-op", () => {
  const once = wrapStatusLine({ statusLine: TRICKY }, "node", "/kit");
  const twice = wrapStatusLine(once.settings, "node", "/kit");
  assert.deepEqual(twice.settings, once.settings);
  assert.equal(twice.changed, false);
  assert.equal(once.changed, true);
});

test("statusLineState and shouldWrap: only the exact wrapper command is the kit's", () => {
  const cmd = (command) => ({ type: "command", command });
  const wrapper = wrapperCommand("node", "/kit");
  assert.equal(wrapper, 'node "/kit/claude/statusline.mjs"');
  const st = (statusLine, ctxFresh = false, saved = true) => statusLineState({ statusLine, ctxFresh, wrapper, saved });
  assert.equal(st(cmd(wrapper)), "wrapped");
  assert.equal(st(cmd(wrapper), true), "wrapped");
  // Anything else naming ctx-tap or a statusline.mjs is already wired, a user's own ~/.claude/statusline.mjs too.
  assert.equal(st(cmd("node ~/.claude/statusline.mjs")), "wired");
  assert.equal(st(cmd('node ~/.claude/statusline.mjs --x')), "wired");
  assert.equal(st(cmd('node "/home/me/.claude/statusline.mjs"')), "wired");
  assert.equal(st(cmd(`${wrapper} --x`)), "wired");
  // A kit wrapper from another checkout (moved, re-cloned) is still the kit's.
  assert.equal(st(cmd('node "/other/kit/claude/statusline.mjs"')), "moved");
  assert.equal(st(cmd('/usr/local/bin/node "/kit/claude/statusline.mjs"'), true), "moved");
  // With no saved line the kit never wrapped this machine: a line in that shape is the user's own.
  assert.equal(st(cmd('node "/home/me/claude/statusline.mjs"'), false, false), "wired");
  assert.equal(statusLineState({ statusLine: cmd('node "/other/kit/claude/statusline.mjs"'), ctxFresh: false, wrapper }), "wired");
  assert.equal(st(cmd(wrapper), false, false), "wrapped");
  // Only claude/statusline.mjs counts as wired: someone's ~/bin/statusline.mjs gets wrapped.
  assert.equal(st(cmd("node ~/bin/statusline.mjs")), "unwrapped");
  assert.equal(st(cmd("~/.claude/line.sh | node ~/kit/claude/ctx-tap.mjs")), "wired");
  assert.equal(st(cmd("~/.claude/line.sh"), true), "wired");
  assert.equal(st(cmd("~/.claude/line.sh")), "unwrapped");
  assert.equal(st(undefined), "unwrapped");
  assert.equal(st(null), "unwrapped");
  // Not a command status line: it can't feed ctx-tap, and it isn't wrapped.
  assert.equal(st({ type: "static", text: "hi" }), "notcommand");
  assert.equal(st({ type: "static", text: "hi" }, true), "notcommand");
  assert.equal(st("echo hi"), "notcommand");
  assert.equal(shouldWrap({ statusLine: cmd("~/.claude/line.sh"), ctxFresh: false, wrapper }), true);
  assert.equal(shouldWrap({ statusLine: null, ctxFresh: false, wrapper }), true);
  assert.equal(shouldWrap({ statusLine: cmd("node ~/bin/statusline.mjs"), ctxFresh: false, wrapper }), true);
  for (const line of [cmd("x && node ctx-tap.mjs"), cmd(wrapper), cmd('node "/old/kit/claude/statusline.mjs"'), cmd("node ~/.claude/statusline.mjs"), { type: "static", text: "hi" }]) {
    assert.equal(shouldWrap({ statusLine: line, ctxFresh: false, wrapper }), false, JSON.stringify(line));
  }
  assert.equal(shouldWrap({ statusLine: cmd("~/.claude/line.sh"), ctxFresh: true, wrapper }), false);
});

test("wrapperDir and rewrapStatusLine: a moved wrapper points at this checkout, keeping padding", () => {
  assert.equal(wrapperDir('node "/old/My Kit/claude/statusline.mjs"'), "/old/My Kit");
  assert.equal(wrapperDir("node ~/.claude/statusline.mjs"), null);
  assert.equal(wrapperDir('node "/home/me/.claude/statusline.mjs"'), null);
  const out = rewrapStatusLine({ model: "x", statusLine: { type: "command", command: 'node "/old/claude/statusline.mjs"', padding: 2 } }, "node", "/kit");
  assert.deepEqual(out, { model: "x", statusLine: { type: "command", command: 'node "/kit/claude/statusline.mjs"', padding: 2 } });
});

test("backupTo keeps the first copy when two land in one folder", () => {
  const dir = home();
  const file = join(dir, "settings.json");
  writeFileSync(file, "original\n");
  backupTo(file, join(dir, "backup", "20261112120000"));
  writeFileSync(file, "merged\n");
  backupTo(file, join(dir, "backup", "20261112120000"));
  assert.equal(readFileSync(join(dir, "backup", "20261112120000", "settings.json"), "utf8"), "original\n");
});

test("the wrapper runs the old command, prints its output and writes the ctx file", () => {
  const h = home();
  const r = run(h, { type: "command", command: "printf 'a b'" }, { context_window: { used_percentage: 81 } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "a b");
  assert.equal(readFileSync(join(h, ".config/herdr-kit/ctx/t1"), "utf8"), "19\n");
});

test("the old command gets the same stdin bytes", () => {
  const input = '{"context_window":{"used_percentage":10},"x":"é \\n"}\n';
  const r = run(home(), { type: "command", command: "cat" }, input);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, input);
});

test("a failing old command still exits 0, keeping what it printed", () => {
  const r = run(home(), { type: "command", command: "printf partial; exit 7" }, { context_window: { used_percentage: 5 } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "partial");
});

test("with no old status line the wrapper prints nothing, but still taps", () => {
  for (const prev of [null, undefined]) {
    const h = home();
    const r = run(h, prev, { context_window: { used_percentage: 50 } });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    assert.equal(readFileSync(join(h, ".config/herdr-kit/ctx/t1"), "utf8"), "50\n");
  }
});

test("junk stdin: no ctx file, the old command still runs, exit 0", () => {
  const h = home();
  const r = run(h, { type: "command", command: "printf ok" }, "not json");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "ok");
  assert.equal(existsSync(join(h, ".config/herdr-kit/ctx")), false);
});

test("a hung old command is cut off at the timeout: what it printed stays, nothing more", () => {
  const started = Date.now();
  const r = run(home(), { type: "command", command: "printf early; sleep 10; printf late" }, "{}", { HERDR_KIT_STATUSLINE_TIMEOUT_MS: "300" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "early");
  assert.ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`);
});

test("a large output passes through whole", () => {
  const r = run(home(), { type: "command", command: "head -c 3000000 /dev/zero | tr '\\0' a" }, "{}");
  assert.equal(r.status, 0);
  assert.equal(r.stdout.length, 3000000);
});

test("SIGTERM on the wrapper kills the old command's process group", async () => {
  const h = home();
  const pidFile = join(h, "pid");
  mkdirSync(join(h, ".config", "herdr-kit"), { recursive: true });
  writeFileSync(join(h, ".config", "herdr-kit", "statusline-prev.json"),
    JSON.stringify({ statusLine: { type: "command", command: `sleep 30 & echo $! > '${pidFile}'; wait` } }));
  const w = spawn(process.execPath, [WRAPPER], { env: { ...process.env, HOME: h, HC_TERMINAL_ID: "t1" }, stdio: ["pipe", "ignore", "ignore"] });
  w.stdin.end("{}");
  const until = async (ok, ms = 5000) => {
    for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 50))) if (ok()) return true;
    return false;
  };
  assert.ok(await until(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").trim()), "the old command started");
  const sleeper = Number(readFileSync(pidFile, "utf8").trim());
  const exited = new Promise((r) => w.on("exit", (code) => r(code)));
  w.kill("SIGTERM");
  assert.equal(await exited, 0);
  const alive = () => { try { process.kill(sleeper, 0); return true; } catch { return false; } };
  assert.ok(await until(() => !alive()), "the grandchild is gone");
});

test("a reader that stops reading can't hold the wrapper past the timeout", async () => {
  const h = home();
  mkdirSync(join(h, ".config", "herdr-kit"), { recursive: true });
  writeFileSync(join(h, ".config", "herdr-kit", "statusline-prev.json"),
    JSON.stringify({ statusLine: { type: "command", command: "head -c 20000000 /dev/zero" } }));
  const started = Date.now();
  // stdout is a pipe nobody reads: it fills and stays full.
  const w = spawn(process.execPath, [WRAPPER], {
    env: { ...process.env, HOME: h, HC_TERMINAL_ID: "t1", HERDR_KIT_STATUSLINE_TIMEOUT_MS: "500" },
    stdio: ["pipe", "pipe", "ignore"],
  });
  w.stdout.pause();
  w.stdin.end("{}");
  const code = await new Promise((r) => w.on("exit", (c) => r(c)));
  assert.equal(code, 0);
  assert.ok(Date.now() - started < 4000, `took ${Date.now() - started} ms`);
  w.stdout.destroy();
});
