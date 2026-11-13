#!/usr/bin/env node
// Status-line tap: writes the context left (whole percent) to
// ~/.config/herdr-kit/ctx/<HC_TERMINAL_ID>, where herdr-signals reads it for
// the rail's context meter. Feed it the status line's JSON on stdin from your
// status line command. It prints nothing and always exits 0, so it can't
// break the status line. Outside Herdr (no HC_TERMINAL_ID) it does nothing.
// install.sh's status-line wrapper (statusline.mjs) does the same write.
import { readFileSync } from "node:fs";
import { writeCtx } from "./ctx.js";

try {
  if (process.env.HC_TERMINAL_ID) writeCtx(JSON.parse(readFileSync(0, "utf8")));
} catch {
  // never break the status line
}
process.exit(0);
