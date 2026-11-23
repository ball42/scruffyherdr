#!/usr/bin/env node
// Claude Code status line installed by scruffyherdr's install.sh. It feeds the
// rail's context meter (writeCtx, as ctx-tap.mjs does) and, with config
// usage_meter on, the usage limits (writeLimits), then runs the status
// line you had before, saved in ~/.config/herdr-kit/statusline-prev.json, with
// the same stdin, and passes its stdout through unchanged. With no old status
// line it prints nothing. An old command still running after 5 s is stopped
// and nothing more is printed, even when the wrapper itself was SIGKILLed (a
// watchdog outlives it). It always exits 0.
//
// The old line runs with HERDR_STATUSLINE_DEPTH set, and a wrapper that starts
// with it set does nothing at all: an old line that leads back to a herdr
// status line (this file, another checkout's copy, or Herdr Chat's
// statusline-herdr.py chained to one) stops there instead of looping
// (one such chain once spawned hundreds of processes).
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeCtx } from "./ctx.js";
import { writeLimits } from "./limits.js";

const TIMEOUT_MS = Number(process.env.HERDR_KIT_STATUSLINE_TIMEOUT_MS) || 5000;
const DEPTH = "HERDR_STATUSLINE_DEPTH";

// Started by a wrapper's old line: the outer wrapper already tapped, so stop.
if (process.env[DEPTH]) process.exit(0);

let input = Buffer.alloc(0);
try {
  input = readFileSync(0);
} catch {
  // no stdin
}
let parsed = null;
try {
  parsed = JSON.parse(input.toString("utf8"));
} catch {
  // junk input: the old status line still runs
}
for (const write of [writeCtx, writeLimits]) {
  try {
    if (parsed) write(parsed);
  } catch {
    // a write error: the old status line still runs
  }
}

let command = null;
try {
  const saved = JSON.parse(readFileSync(join(homedir(), ".config", "herdr-kit", "statusline-prev.json"), "utf8"));
  if (typeof saved?.statusLine?.command === "string" && saved.statusLine.command.trim()) command = saved.statusLine.command;
} catch {
  // no old status line
}

if (!command) process.exit(0);

// One deadline for everything: the old command and getting its output out.
// stdout writes are queued (never a busy loop on a full pipe), so a reader that
// stops reading can't hold the wrapper past it.
let child;
let watchdog;
// The watchdog's own group (it is detached): its sh and its sleep go together.
const stopWatchdog = () => {
  try {
    if (watchdog?.pid) process.kill(-watchdog.pid, "SIGKILL");
  } catch {
    // already gone
  }
};
const stop = () => {
  try {
    if (child?.pid) process.kill(-child.pid, "SIGKILL");
  } catch {
    // already gone
  }
  stopWatchdog();
  process.exit(0);
};
setTimeout(stop, TIMEOUT_MS);
// Claude Code killing the wrapper takes the old command's process group with it.
for (const sig of ["SIGTERM", "SIGHUP", "SIGINT"]) process.on(sig, stop);
process.stdout.on("error", stop); // EPIPE: nobody is reading

let done = false;
const finish = () => {
  if (done) return;
  done = true;
  // A line that finished keeps what it started in the background, as before the watchdog.
  stopWatchdog();
  if (process.stdout.writableLength === 0) process.exit(0);
  process.stdout.once("drain", () => process.exit(0));
};
try {
  // Its own process group, so the timeout stops anything it started too.
  child = spawn("/bin/sh", ["-c", command], { stdio: ["pipe", "pipe", "inherit"], detached: true, env: { ...process.env, [DEPTH]: "1" } });
} catch {
  process.exit(0);
}
// SIGKILL can't be caught, so a wrapper killed that way takes its timer and handlers
// with it, and the old line's group would run on with no deadline. A watchdog in a
// group of its own outlives the wrapper: at the deadline, if the wrapper is gone without
// stopping it, it kills the old line's group. Once the group exists its id can't be
// reused while any member lives.
try {
  const secs = (TIMEOUT_MS / 1000).toFixed(3);
  watchdog = spawn("/bin/sh", ["-c", `sleep ${secs}; kill -0 ${process.pid} 2>/dev/null || kill -KILL -- -${child.pid} 2>/dev/null`], { stdio: "ignore", detached: true });
  watchdog.on("error", () => {});
  watchdog.unref();
} catch {
  // no watchdog: the timer and the signal handlers still stop the old line
}
child.on("error", finish);
child.stdout.on("data", (d) => process.stdout.write(d));
child.stdout.on("close", finish);
child.stdin.on("error", () => {}); // a command that doesn't read stdin
child.stdin.end(input);
