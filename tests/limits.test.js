import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { freshLimits, keepPeak, writeLimits } from "../claude/limits.js";

const CLAUDE = join(dirname(fileURLToPath(import.meta.url)), "..", "claude");
const RESETS = 1795118400;
const reading = (five, week = 29, resets = RESETS) => ({
  rate_limits: {
    five_hour: { used_percentage: five, resets_at: resets },
    seven_day: { used_percentage: week, resets_at: resets + 500000 },
  },
});
const limitsFile = (home) => join(home, ".cache", "herdr-chat", "claude-limits.json");
const stored = (home) => JSON.parse(readFileSync(limitsFile(home), "utf8"));
const used = (home, minutes) => stored(home).limits.find((l) => l.minutes === minutes)?.used;
function homeWith(cfg = { usage_meter: true }) {
  const home = mkdtempSync(join(tmpdir(), "limits-"));
  mkdirSync(join(home, ".config", "herdr-kit"), { recursive: true });
  writeFileSync(join(home, ".config", "herdr-kit", "config.json"), JSON.stringify(cfg));
  return home;
}

test("freshLimits: the 5-hour and weekly windows from the status line, or none", () => {
  assert.deepEqual(freshLimits(reading(84.5)), [
    { minutes: 300, used: 84.5, resets: RESETS },
    { minutes: 10080, used: 29, resets: RESETS + 500000 },
  ]);
  assert.deepEqual(freshLimits({ rate_limits: { five_hour: { used_percentage: "x" } } }), []);
  assert.deepEqual(freshLimits({}), []);
  assert.deepEqual(freshLimits(null), []);
});

test("keepPeak: a lower reading for the same reset epoch is dropped, a new epoch replaces it", () => {
  const high = [{ minutes: 300, used: 86, resets: RESETS }, { minutes: 10080, used: 29, resets: 9 }];
  // An idle session's older, lower reading: both windows keep the stored figure.
  assert.deepEqual(keepPeak(high, [{ minutes: 300, used: 71, resets: RESETS }, { minutes: 10080, used: 27, resets: 9 }]), high);
  // A higher reading wins.
  assert.equal(keepPeak(high, [{ minutes: 300, used: 90, resets: RESETS }])[0].used, 90);
  // A new window starts low, and that is the truth.
  assert.deepEqual(keepPeak(high, [{ minutes: 300, used: 3, resets: RESETS + 18000 }])[0], { minutes: 300, used: 3, resets: RESETS + 18000 });
  // A window the fresh reading lacks is kept as stored.
  assert.deepEqual(keepPeak(high, [{ minutes: 300, used: 1, resets: RESETS + 18000 }])[1], high[1]);
  // No reset epoch to compare: the fresh reading stands.
  assert.equal(keepPeak([{ minutes: 300, used: 86, resets: null }], [{ minutes: 300, used: 71, resets: null }])[0].used, 71);
  // Nothing stored, or junk stored.
  assert.deepEqual(keepPeak(null, high), high);
  assert.deepEqual(keepPeak([null, { minutes: 300 }], high), high);
});

test("writeLimits keeps the higher reading when an older, lower one arrives", () => {
  const home = homeWith();
  writeLimits(reading(86), home, 1000);
  writeLimits(reading(71, 27), home, 1001);
  assert.equal(used(home, 300), 86);
  assert.equal(used(home, 10080), 29);
  assert.equal(stored(home).at, 1001);
  writeLimits(reading(88), home, 1002);
  assert.equal(used(home, 300), 88);
  writeLimits(reading(2, 30, RESETS + 18000), home, 1003);
  assert.equal(used(home, 300), 2);
});

test("writeLimits writes nothing without usage_meter, or without a reading", () => {
  for (const cfg of [{}, { usage_meter: false }]) {
    const home = homeWith(cfg);
    writeLimits(reading(50), home, 1);
    assert.equal(existsSync(limitsFile(home)), false);
  }
  const bare = mkdtempSync(join(tmpdir(), "limits-"));
  writeLimits(reading(50), bare, 1); // no config at all
  assert.equal(existsSync(limitsFile(bare)), false);
  const home = homeWith();
  writeLimits({ context_window: { used_percentage: 5 } }, home, 1);
  assert.equal(existsSync(limitsFile(home)), false);
});

test("writeLimits over a malformed file starts fresh", () => {
  const home = homeWith();
  mkdirSync(dirname(limitsFile(home)), { recursive: true });
  writeFileSync(limitsFile(home), "{nope");
  writeLimits(reading(40), home, 5);
  assert.equal(used(home, 300), 40);
});

// Both status-line entry points do the write, inside Herdr or not (the limits are the account's).
for (const script of ["ctx-tap.mjs", "statusline.mjs"]) {
  test(`${script} keeps the peak in claude-limits.json and still prints nothing extra`, () => {
    const home = homeWith();
    const run = (input) => spawnSync(process.execPath, [join(CLAUDE, script)], {
      input: JSON.stringify(input),
      env: { ...process.env, HOME: home, HC_TERMINAL_ID: "" },
      encoding: "utf8",
    });
    for (const r of [run(reading(86)), run(reading(71))]) {
      assert.equal(r.status, 0);
      assert.equal(r.stdout, "");
    }
    assert.equal(used(home, 300), 86);
  });
}
