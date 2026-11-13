import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ctxLeft } from "../claude/ctx.js";

const TAP = join(dirname(fileURLToPath(import.meta.url)), "..", "claude", "ctx-tap.mjs");
const tap = (home, input, terminal = "t7") => spawnSync(process.execPath, [TAP], {
  input: typeof input === "string" ? input : JSON.stringify(input),
  env: { ...process.env, HOME: home, HC_TERMINAL_ID: terminal ?? "" },
  encoding: "utf8",
});

test("ctxLeft: percent left, clamped, null without a reading", () => {
  assert.equal(ctxLeft({ context_window: { used_percentage: 72.4 } }), 28);
  assert.equal(ctxLeft({ context_window: { used_percentage: 0 } }), 100);
  assert.equal(ctxLeft({ context_window: { used_percentage: 130 } }), 0);
  assert.equal(ctxLeft({ context_window: {} }), null);
  assert.equal(ctxLeft({}), null);
  assert.equal(ctxLeft(null), null);
});

test("ctx tap writes ctx/<terminal>, prints nothing, exits 0", () => {
  const home = mkdtempSync(join(tmpdir(), "ctx-tap-"));
  const r = tap(home, { context_window: { used_percentage: 81 } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.equal(readFileSync(join(home, ".config/herdr-kit/ctx/t7"), "utf8"), "19\n");
  tap(home, { context_window: { used_percentage: 90 } });
  assert.equal(readFileSync(join(home, ".config/herdr-kit/ctx/t7"), "utf8"), "10\n");
});

test("ctx tap does nothing outside Herdr, on junk, or on a bad terminal id, and still exits 0", () => {
  const home = mkdtempSync(join(tmpdir(), "ctx-tap-"));
  for (const [input, term] of [[{ context_window: { used_percentage: 5 } }, ""], ["not json", "t1"], [{ context_window: { used_percentage: 5 } }, "../evil"]]) {
    const r = tap(home, input, term);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  }
  assert.equal(existsSync(join(home, ".config/herdr-kit/ctx")), false);
});
