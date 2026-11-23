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

// The wrapper stops the old command at a wall-clock deadline (5 s unless
// HERDR_KIT_STATUSLINE_TIMEOUT_MS says otherwise). On a loaded machine a
// healthy command can take longer than that, and the deadline then cuts its
// output short, so a test that isn't about the deadline sets it out of reach.
// A test that is about the deadline gives the old command far longer than the
// deadline to run, and checks that the wrapper was done well before that.
const NO_DEADLINE = { HERDR_KIT_STATUSLINE_TIMEOUT_MS: "600000" };
const SLOW = 30_000; // how long a hung old command would run, ms

// run <home> <prev statusLine or null or undefined (no file)> <stdin>
function run(home, prev, input, env = NO_DEADLINE) {
  if (prev !== undefined) {
    mkdirSync(join(home, ".config", "herdr-kit"), { recursive: true });
    writeFileSync(join(home, ".config", "herdr-kit", "statusline-prev.json"), JSON.stringify({ statusLine: prev }));
  }
  return spawnSync(process.execPath, [WRAPPER], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    env: { ...process.env, HOME: home, HC_TERMINAL_ID: "t1", ...env },
    encoding: "utf8",
    timeout: 120_000, // a backstop: a passing run never waits on it
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
  // The deadline has to leave room for the shell to start and print first, loaded or not.
  const r = run(home(), { type: "command", command: `printf early; sleep ${SLOW / 1000}; printf late` }, "{}", { HERDR_KIT_STATUSLINE_TIMEOUT_MS: "2000" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "early");
  assert.ok(Date.now() - started < SLOW, `took ${Date.now() - started} ms`);
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
  const w = spawn(process.execPath, [WRAPPER], { env: { ...process.env, HOME: h, HC_TERMINAL_ID: "t1", ...NO_DEADLINE }, stdio: ["pipe", "ignore", "ignore"] });
  w.stdin.end("{}");
  // Polls: a passing run returns as soon as the state is there.
  const until = async (ok, ms = SLOW) => {
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

// SIGKILL can't be caught: the wrapper's timer and signal handlers die with it, and its
// detached old line used to run on for good (ppid 1). A watchdog outside both stops it.
test("SIGKILL on the wrapper: the old command's process group is gone by the deadline", { timeout: 2 * SLOW }, async () => {
  const h = home();
  const pidFile = join(h, "pid");
  mkdirSync(join(h, ".config", "herdr-kit"), { recursive: true });
  writeFileSync(join(h, ".config", "herdr-kit", "statusline-prev.json"),
    JSON.stringify({ statusLine: { type: "command", command: `sleep 30 & echo $! > '${pidFile}'; wait` } }));
  const w = spawn(process.execPath, [WRAPPER], {
    env: { ...process.env, HOME: h, HC_TERMINAL_ID: "t1", HERDR_KIT_STATUSLINE_TIMEOUT_MS: "1500" },
    stdio: ["pipe", "ignore", "ignore"],
  });
  w.stdin.end("{}");
  const until = async (ok, ms = SLOW) => {
    for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 50))) if (ok()) return true;
    return false;
  };
  assert.ok(await until(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").trim()), "the old command started");
  const sleeper = Number(readFileSync(pidFile, "utf8").trim());
  const exited = new Promise((r) => w.on("exit", (_code, sig) => r(sig)));
  w.kill("SIGKILL");
  assert.equal(await exited, "SIGKILL");
  const alive = () => { try { process.kill(sleeper, 0); return true; } catch { return false; } };
  // The deadline is 1.5 s; the sleeper would run 30 s. Polls give a loaded machine slack.
  assert.ok(await until(() => !alive(), 10_000), "the old command's child outlived the SIGKILLed wrapper's deadline");
});

test("an old command that finishes keeps what it started in the background, and leaves no watchdog", async () => {
  const h = home();
  const pidFile = join(h, "pid");
  const r = run(h, { type: "command", command: `(sleep 4.321 </dev/null >/dev/null 2>&1 & echo $! > '${pidFile}'); printf done` }, "{}", { HERDR_KIT_STATUSLINE_TIMEOUT_MS: "1000" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "done");
  const bg = Number(readFileSync(pidFile, "utf8").trim());
  await new Promise((res) => setTimeout(res, 2000));
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  assert.ok(alive(bg), "a finished line's own background work was killed");
  process.kill(bg, "SIGKILL");
  const dog = spawnSync("pgrep", ["-f", `kill -0 ${r.pid} `], { encoding: "utf8" });
  assert.equal(dog.stdout.trim(), "", "the watchdog outlived a wrapper that finished");
});

test("a reader that stops reading can't hold the wrapper past the timeout", { timeout: 2 * SLOW }, async () => {
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
  // Without the deadline the wrapper would wait on the full pipe for good.
  assert.ok(Date.now() - started < SLOW, `took ${Date.now() - started} ms`);
  w.stdout.destroy();
});

// A status line that chained back to itself. The kit wrapper ran
// the saved line (Herdr Chat's statusline-herdr.py), whose chain was a second
// copy of the wrapper (another checkout), which read the same saved line and ran
// it again: hundreds of processes and a load in the hundreds. The chain script below stands in
// for statusline-herdr.py; it counts its runs and gives up after 6, so this
// test can't fork-bomb the machine when the guard is missing.
test("two wrappers chained through the saved line: the saved line runs once per render", () => {
  const h = home();
  const copy = join(h, "scruffyherdr", "claude");
  mkdirSync(copy, { recursive: true });
  for (const f of ["statusline.mjs", "ctx.js", "limits.js"]) writeFileSync(join(copy, f), readFileSync(join(KIT, "claude", f)));
  const count = join(h, "runs");
  const chain = join(h, "statusline-herdr.sh");
  writeFileSync(chain, [
    `echo run >> '${count}'`,
    `[ "$(wc -l < '${count}')" -gt 6 ] && exit 0`,
    "printf 'line|'",
    `'${process.execPath}' '${join(copy, "statusline.mjs")}'`,
  ].join("\n") + "\n");
  const r = run(h, { type: "command", command: `sh '${chain}'` }, "{}", { HERDR_KIT_STATUSLINE_TIMEOUT_MS: "20000" });
  assert.equal(r.status, 0);
  assert.equal(readFileSync(count, "utf8").trim().split("\n").length, 1, "the saved line ran more than once");
  assert.equal(r.stdout, "line|");
});

test("a wrapper started by a wrapper's saved line runs nothing and prints nothing", () => {
  const h = home();
  const r = run(h, { type: "command", command: "printf again" }, "{}", { ...NO_DEADLINE, HERDR_STATUSLINE_DEPTH: "1" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("the saved line runs with HERDR_STATUSLINE_DEPTH set", () => {
  const r = run(home(), { type: "command", command: "printf %s \"$HERDR_STATUSLINE_DEPTH\"" }, "{}");
  assert.equal(r.stdout, "1");
});

test("a timed-out old command's whole process group is killed", async () => {
  const h = home();
  const pidFile = join(h, "pid");
  const r = run(h, { type: "command", command: `sleep 30 & echo $! > '${pidFile}'; wait` }, "{}", { HERDR_KIT_STATUSLINE_TIMEOUT_MS: "1500" });
  assert.equal(r.status, 0);
  const sleeper = Number(readFileSync(pidFile, "utf8").trim());
  const alive = () => { try { process.kill(sleeper, 0); return true; } catch { return false; } };
  for (const end = Date.now() + 5000; alive() && Date.now() < end;) await new Promise((res) => setTimeout(res, 50));
  assert.equal(alive(), false, "the old command's background child outlived the timeout");
});

test("statusLineState: Herdr Chat's line whose chain is a kit wrapper is wired, never saved", () => {
  const wrapper = wrapperCommand("node", "/kit");
  const line = { type: "command", command: "python3 ~/.claude/statusline-herdr.py" };
  assert.equal(statusLineState({ statusLine: line, ctxFresh: false, wrapper, chain: 'node "/home/me/scruffyherdr/claude/statusline.mjs"' }), "wired");
  assert.equal(statusLineState({ statusLine: line, ctxFresh: false, wrapper, chain: "node ~/kit/claude/ctx-tap.mjs" }), "wired");
  assert.equal(statusLineState({ statusLine: line, ctxFresh: false, wrapper, chain: "~/.claude/statusline.sh" }), "unwrapped");
  assert.equal(statusLineState({ statusLine: line, ctxFresh: false, wrapper, chain: null }), "unwrapped");
});

test("wrapstatus reads statusline-herdr.json's chain: a line that leads back to a wrapper is left alone", () => {
  const h = home();
  mkdirSync(join(h, ".claude"), { recursive: true });
  const settings = join(h, ".claude", "settings.json");
  const prevFile = join(h, ".config", "herdr-kit", "statusline-prev.json");
  const line = { type: "command", command: `python3 ${h}/.claude/statusline-herdr.py` };
  const go = () => spawnSync(process.execPath, [join(KIT, "scripts", "merge-config.js"), "wrapstatus", settings, "node", "/kit", prevFile, "stale"],
    { env: { ...process.env, HOME: h, HERDR_KIT_NO_BACKUP: "1" }, encoding: "utf8" });
  writeFileSync(settings, JSON.stringify({ statusLine: line }));
  writeFileSync(join(h, ".claude", "statusline-herdr.json"), JSON.stringify({ chain: `node "${h}/scruffyherdr/claude/statusline.mjs"` }));
  let r = go();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(prevFile), false, "a line that chains to a wrapper was saved as the previous one");
  assert.deepEqual(JSON.parse(readFileSync(settings, "utf8")).statusLine, line);
  // A chain to the user's own line is not a wrapper: wrapped as before.
  writeFileSync(join(h, ".claude", "statusline-herdr.json"), JSON.stringify({ chain: `${h}/.claude/statusline.sh` }));
  r = go();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(prevFile, "utf8")).statusLine, line);
});
