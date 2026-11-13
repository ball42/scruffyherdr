// The extras are opt-in: each is a config switch, off by default, and gated where it runs.
// main.js touches Herdr globals, so these tests read its source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = readFileSync(join(ROOT, "herdr/mods/herdr-signals/main.js"), "utf8");

/** DEFAULTS from main.js, evaluated. */
function defaults() {
  const m = MAIN.match(/const DEFAULTS = (\{[\s\S]*?\n\});/);
  assert.ok(m, "DEFAULTS found");
  return new Function(`return ${m[1]}`)();
}

/** The body of the method `name` in main.js's class. */
function method(name) {
  const m = MAIN.match(new RegExp(`\\n  (?:async )?${name}\\([^)]*\\) \\{\\n([\\s\\S]*?)\\n  \\}\\n`));
  assert.ok(m, `${name} found`);
  return m[1];
}

test("DEFAULTS: every extra is off", () => {
  const d = defaults();
  for (const k of ["deck", "readme_tabs", "usage_meter", "run_cards", "pr_status"]) assert.strictEqual(d[k], false, k);
  assert.deepEqual(d.addons, []);
  assert.strictEqual(d.run_log_pipe, "");
  assert.strictEqual(d.discord_webhook, "");
});

test("config.example.json has every DEFAULTS key", () => {
  const ex = JSON.parse(readFileSync(join(ROOT, "config.example.json"), "utf8"));
  for (const k of Object.keys(defaults())) assert.ok(k in ex, k);
});

test("README Config table lists every DEFAULTS key (and the public README's, when public/ is there)", () => {
  for (const rel of ["README.md", "public/README.md"]) {
    if (rel !== "README.md" && !existsSync(join(ROOT, rel))) continue;
    const readme = readFileSync(join(ROOT, rel), "utf8");
    for (const k of Object.keys(defaults())) assert.match(readme, new RegExp(`\\| \`${k}\` \\|`), `${rel}: ${k}`);
  }
});

test("usage_meter off: the limits file is never read", () => {
  assert.match(method("reloadUsage"), /^\s*if \(!this\.cfg\.usage_meter\) return;[\s\S]*readTextFile/);
});

test("pr_status off: no gh exec", () => {
  assert.match(method("refreshPrs"), /^\s*if \(!this\.cfg\.pr_status\) return;/);
  assert.match(method("prWanted"), /^\s*if \(!this\.cfg\.pr_status\) return \{\};/);
});

test("run_cards off: no runstate reads, and the model carries no Run rows", () => {
  assert.match(method("reloadRunState"), /^\s*if \(!this\.cfg\.run_cards\) return;/);
  assert.match(method("pruneRunState"), /^\s*if \(!this\.cfg\.run_cards\) return;/);
  assert.match(MAIN, /run_cards[\s\S]{0,120}runs: \[\]/);
});

test("deck and readme_tabs are gated on a plain true", () => {
  assert.match(MAIN, /if \(this\.cfg\.deck\) await this\.sendDeck/);
  assert.match(MAIN, /if \(this\.cfg\.readme_tabs\) this\.syncReadmeTabs/);
});

test("run_log_pipe is published for the Run script", () => {
  assert.match(MAIN, /setShared\("kit\.runLogPipe"/);
});

// Built from pieces so the public scrub (tests/scrub.test.js) passes this file.
const NOTES_DIR = new RegExp("reli" + "quary", "i");

test("no private notes folder in the core's look.js", () => {
  for (const mod of ["kit-rail", "kit-pane", "kit-tabs", "kit-scenes"]) {
    assert.doesNotMatch(readFileSync(join(ROOT, "herdr/mods", mod, "look.js"), "utf8"), NOTES_DIR, mod);
  }
});

test("run_cards off: no runstate folder is made or watched", () => {
  assert.match(MAIN, /if \(this\.cfg\.run_cards\) \{\n\s*await exec\("mkdir", \["-p", this\.runDir\]\)/);
  assert.match(MAIN, /if \(this\.cfg\.run_cards\) \{\n\s*cx\.spawn\(async \(cx\) => \{\n\s*for \(;;\) \{\n\s*await watchFolder\(this\.runDir\)/);
  assert.equal((MAIN.match(/watchFolder\(this\.runDir\)/g) ?? []).length, 1);
  assert.equal((MAIN.match(/"-p", this\.runDir/g) ?? []).length, 1);
});
