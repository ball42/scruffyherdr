#!/usr/bin/env node
// Claude Code status line installed by scruffyherdr's install.sh. It feeds the
// rail's context meter (writeCtx, as ctx-tap.mjs does), then runs the status
// line you had before, saved in ~/.config/herdr-kit/statusline-prev.json, with
// the same stdin, and passes its stdout through unchanged. With no old status
// line it prints nothing. An old command still running after 5 s is stopped
// and nothing more is printed. It always exits 0.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeCtx } from "./ctx.js";

const TIMEOUT_MS = Number(process.env.HERDR_KIT_STATUSLINE_TIMEOUT_MS) || 5000;

let input = Buffer.alloc(0);
try {
  input = readFileSync(0);
} catch {
  // no stdin
}
try {
  writeCtx(JSON.parse(input.toString("utf8")));
} catch {
  // junk input or a write error: the old status line still runs
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
const stop = () => {
  try {
    if (child?.pid) process.kill(-child.pid, "SIGKILL");
  } catch {
    // already gone
  }
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
  if (process.stdout.writableLength === 0) process.exit(0);
  process.stdout.once("drain", () => process.exit(0));
};
try {
  // Its own process group, so the timeout stops anything it started too.
  child = spawn("/bin/sh", ["-c", command], { stdio: ["pipe", "pipe", "inherit"], detached: true });
} catch {
  process.exit(0);
}
child.on("error", finish);
child.stdout.on("data", (d) => process.stdout.write(d));
child.stdout.on("close", finish);
child.stdin.on("error", () => {}); // a command that doesn't read stdin
child.stdin.end(input);
