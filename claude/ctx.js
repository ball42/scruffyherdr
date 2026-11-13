// Context left, from Claude Code's status line JSON. ctxLeft is pure; writeCtx
// is the one writer of ~/.config/herdr-kit/ctx/<terminal>, shared by ctx-tap.mjs
// and statusline.mjs. Plain node only (never loaded by a Herdr mod).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Whole percent of context left (0..100), or null when the input has no reading. */
export function ctxLeft(input) {
  const used = input?.context_window?.used_percentage;
  if (typeof used !== "number" || !Number.isFinite(used)) return null;
  return Math.max(0, Math.min(100, Math.round(100 - used)));
}

/**
 * Writes the context left for `terminal` (HC_TERMINAL_ID) to ctx/<terminal>,
 * only when the figure changed (the status line redraws often). Does nothing
 * outside Herdr (no terminal), on a bad terminal id, or without a reading.
 * May throw on I/O errors: callers catch.
 */
export function writeCtx(input, terminal = process.env.HC_TERMINAL_ID, home = homedir()) {
  if (!terminal || !/^[A-Za-z0-9_-]+$/.test(terminal)) return;
  const left = ctxLeft(input);
  if (left === null) return;
  const dir = join(home, ".config", "herdr-kit", "ctx");
  const file = join(dir, terminal);
  let prev = null;
  try {
    prev = readFileSync(file, "utf8").trim();
  } catch {
    // first reading
  }
  if (prev === String(left)) return;
  mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${left}\n`);
  renameSync(tmp, file);
}
