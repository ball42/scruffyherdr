#!/usr/bin/env node
// Status-line tap: writes the context left (whole percent) to
// ~/.config/herdr-kit/ctx/<HC_TERMINAL_ID>, where herdr-signals reads it for
// the rail's context meter. Feed it the status line's JSON on stdin from your
// status line command. It prints nothing and always exits 0, so it can't
// break the status line. Outside Herdr (no HC_TERMINAL_ID) it writes no ctx
// file. With config usage_meter on it also keeps the usage limits in
// ~/.cache/herdr-chat/claude-limits.json (limits.js), inside Herdr or not.
// install.sh's status-line wrapper (statusline.mjs) does the same writes.
import { readFileSync } from "node:fs";
import { writeLimits } from "./limits.js";
import { writeCtx } from "./ctx.js";

let input = null;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  // never break the status line
}
try {
  if (input && process.env.HC_TERMINAL_ID) writeCtx(input);
} catch {
  // never break the status line
}
try {
  if (input) writeLimits(input);
} catch {
  // never break the status line
}
process.exit(0);
