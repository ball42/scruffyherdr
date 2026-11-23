// The repo is a Claude Code plugin marketplace: a gallery install (herdr/RECIPE.md) gets the
// name hook through /plugin install, the same hook on the same events install.sh adds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

test("the marketplace lists one plugin, the repo itself", () => {
  const m = json(".claude-plugin/marketplace.json");
  assert.equal(m.name, "scruffyherdr");
  assert.ok(m.owner?.name);
  assert.deepEqual(m.plugins.map((p) => [p.name, p.source]), [["scruffyherdr", "./"]]);
  assert.equal(json(".claude-plugin/plugin.json").name, "scruffyherdr");
});

test("the plugin's hooks are install.sh's name hook: same script, same events, all async", () => {
  const sh = readFileSync(join(ROOT, "install.sh"), "utf8");
  const events = sh.match(/^NAME_EVENTS=(.+)$/m)[1].split(",").map((e) => e.split(":"));
  const { hooks } = json("hooks/hooks.json");
  assert.deepEqual(Object.keys(hooks).sort(), events.map(([e]) => e).sort());
  for (const [ev, flag] of events) {
    assert.deepEqual(hooks[ev], [{ hooks: [{ type: "command", command: 'node "${CLAUDE_PLUGIN_ROOT}/claude/name-hook.mjs"', async: flag === "async" }] }], ev);
  }
  assert.ok(existsSync(join(ROOT, "claude/name-hook.mjs")));
});

test("the recipe and the README send gallery users to /plugin install", () => {
  for (const f of ["herdr/RECIPE.md", "README.md"]) {
    const t = readFileSync(join(ROOT, f), "utf8");
    assert.ok(t.includes("/plugin marketplace add ball42/scruffyherdr"), f);
    assert.match(t, /\/plugin install scruffyherdr@scruffyherdr/, f);
  }
});
