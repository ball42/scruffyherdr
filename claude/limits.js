// Usage limits, from Claude Code's status line JSON, for the strip's usage meter.
// writeLimits is the one writer of ~/.cache/herdr-chat/claude-limits.json, shared
// by ctx-tap.mjs and statusline.mjs. Every Claude's status line writes it, and an
// idle one redraws with the reading it got on its last turn, older and lower than
// a busy one's. Use within a window never goes down, so the file keeps the peak:
// a lower reading for the same reset epoch is dropped, and a new epoch replaces it.
// Plain node only (never loaded by a Herdr mod).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const WINDOWS = [["five_hour", 300], ["seven_day", 10080]];

/** The status line's windows as `[{minutes, used, resets}]`, the file's shape. */
export function freshLimits(input) {
  const rl = input?.rate_limits;
  const out = [];
  for (const [key, minutes] of WINDOWS) {
    const w = rl?.[key];
    if (typeof w?.used_percentage !== "number" || !Number.isFinite(w.used_percentage)) continue;
    out.push({ minutes, used: w.used_percentage, resets: w.resets_at ?? null });
  }
  return out;
}

/** The windows to store: each fresh one, unless the stored one has the same reset epoch and more use. */
export function keepPeak(stored, fresh) {
  const prev = new Map();
  for (const l of Array.isArray(stored) ? stored : []) {
    if (l && Number.isFinite(l.minutes) && Number.isFinite(l.used)) prev.set(l.minutes, l);
  }
  const out = fresh.map((f) => {
    const p = prev.get(f.minutes);
    const same = p && Number.isFinite(f.resets) && p.resets === f.resets;
    return same && p.used > f.used ? p : f;
  });
  for (const [minutes, p] of prev) if (!out.some((l) => l.minutes === minutes)) out.push(p);
  return out;
}

function usageMeterOn(home) {
  try {
    return JSON.parse(readFileSync(join(home, ".config", "herdr-kit", "config.json"), "utf8"))?.usage_meter === true;
  } catch {
    return false;
  }
}

/**
 * Merges the status line's reading into claude-limits.json (keepPeak), only
 * with config `usage_meter` on. `at` (seconds) is when a status line last
 * reported. Two writers racing can still drop one reading; the next redraw
 * brings it back. May throw on I/O errors: callers catch.
 */
export function writeLimits(input, home = homedir(), nowSec = Date.now() / 1000) {
  const fresh = freshLimits(input);
  if (!fresh.length || !usageMeterOn(home)) return;
  const dir = join(home, ".cache", "herdr-chat");
  const file = join(dir, "claude-limits.json");
  let stored = null;
  try {
    stored = JSON.parse(readFileSync(file, "utf8"))?.limits;
  } catch {
    // first reading, or a malformed file: start fresh
  }
  mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ limits: keepPeak(stored, fresh), at: nowSec }));
  renameSync(tmp, file);
}
