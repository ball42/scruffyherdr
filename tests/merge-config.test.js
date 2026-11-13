import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addHooks, removeHooks, addLayoutKeys, removeLayoutKeys, layoutKeyNotices, HOOK_EVENTS,
  addTableKeys, bindingsTable, removeTableKeys, tableKeyNotices,
} from "../scripts/merge-config.js";

const CMD = "node /repo/claude/name-hook.mjs";
const QUOTED = 'node "/home/me/My Repos/herdr-kit/claude/name-hook.mjs"';
const LEGACY = "node /home/me/My Repos/herdr-kit/claude/name-hook.mjs";
const existing = {
  model: "x",
  hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "guard.sh" }] }],
    Stop: [{ hooks: [{ type: "command", command: "mine.sh" }] }] },
};

// Off the kit layout no copy of herdr-signals is shown to take a mod command,
// so global cmd-shift-s switches to the kit layout; there it opens the picker.
const TO_KIT = { command: "layout.switch", args: { name: "scruffy" } };

test("adds hooks once", () => {
  const once = addHooks(existing, CMD);
  const twice = addHooks(once, CMD);
  assert.deepEqual(twice, once);
  for (const ev of HOOK_EVENTS) {
    const ours = twice.hooks[ev].flatMap((e) => e.hooks).filter((h) => h.command === CMD);
    assert.equal(ours.length, 1, ev);
  }
});

test("hook events include PermissionRequest and PreToolUse", () => {
  assert.deepEqual(HOOK_EVENTS, [
    "SessionStart", "UserPromptSubmit", "Stop", "Notification", "PermissionRequest", "PreToolUse",
  ]);
  const out = addHooks({}, CMD);
  for (const ev of ["PermissionRequest", "PreToolUse"]) {
    assert.equal(out.hooks[ev][0].hooks[0].command, CMD, ev);
  }
});

test("keeps existing hooks", () => {
  const out = addHooks(existing, CMD);
  assert.deepEqual(out.hooks.PreToolUse[0], existing.hooks.PreToolUse[0]);
  assert.ok(out.hooks.Stop.flatMap((e) => e.hooks).some((h) => h.command === "mine.sh"));
  assert.equal(out.model, "x");
});

test("remove undoes add", () => {
  assert.deepEqual(removeHooks(addHooks(existing, CMD), CMD), existing);
  assert.deepEqual(removeHooks(addHooks({}, CMD), CMD), {});
});

test("quoted hook command matches on re-add and remove", () => {
  const once = addHooks(existing, QUOTED);
  assert.deepEqual(addHooks(once, QUOTED), once);
  assert.deepEqual(removeHooks(once, QUOTED), existing);
});

test("an unquoted hook from an older install is adopted, not duplicated", () => {
  const legacy = addHooks(existing, LEGACY);
  const out = addHooks(legacy, QUOTED);
  for (const ev of HOOK_EVENTS) {
    const ours = out.hooks[ev].flatMap((e) => e.hooks).filter((h) => h.command.includes("name-hook"));
    assert.deepEqual(ours.map((h) => h.command), [QUOTED], ev);
  }
  assert.deepEqual(removeHooks(out, QUOTED), existing);
  assert.deepEqual(removeHooks(legacy, QUOTED), existing);
});

test("adds layout keys without touching global's existing keys", () => {
  const keys = { global: { "cmd-q": "app.quit" } };
  const out = addLayoutKeys(keys);
  assert.deepEqual(out.global, { "cmd-q": "app.quit", "cmd-shift-u": "herdr-signals.urgent", "cmd-shift-f": "herdr-signals.focus", "cmd-shift-s": TO_KIT });
  assert.deepEqual(out["layout:scruffy"], {
    "cmd-shift-g": "herdr-signals.view-toggle",
    "cmd-shift-s": "herdr-signals.scenes",
    "cmd-alt-]": "herdr-signals.spot-next",
    "cmd-alt-[": "herdr-signals.spot-prev",
    "cmd-shift-a": "herdr-signals.grid-all",
  });
  assert.equal(out["layout:endor"], undefined, "no per-scene sections any more");
  assert.equal(out["layout:endor-grid"], undefined);
  assert.deepEqual(addLayoutKeys(out), out);
});

test("a rebound key is left alone and reported", () => {
  const keys = { "layout:scruffy": { "cmd-alt-]": "space.next" }, global: { "cmd-shift-u": "tab.new" } };
  const out = addLayoutKeys(keys);
  assert.equal(out["layout:scruffy"]["cmd-alt-]"], "space.next");
  assert.equal(out.global["cmd-shift-u"], "tab.new");
  assert.equal(out["layout:scruffy"]["cmd-alt-["], "herdr-signals.spot-prev");
  const notes = layoutKeyNotices(keys).join("\n");
  assert.match(notes, /layout:scruffy cmd-alt-\]/);
  assert.match(notes, /space\.next/);
  assert.match(notes, /global cmd-shift-u/);
  assert.deepEqual(layoutKeyNotices(addLayoutKeys({})), []);
});

test("a rebound cmd-shift-g is left alone and survives uninstall", () => {
  const keys = { "layout:scruffy": { "cmd-shift-g": "tab.new" } };
  const installed = addLayoutKeys(keys);
  assert.equal(installed["layout:scruffy"]["cmd-shift-g"], "tab.new");
  const out = removeLayoutKeys(installed);
  assert.deepEqual(out, { "layout:scruffy": { "cmd-shift-g": "tab.new" } });
});

test("unkeys removes only ours", () => {
  const keys = { global: { "cmd-q": "app.quit" }, "layout:scruffy": { "cmd-k": "x" } };
  const out = removeLayoutKeys(addLayoutKeys(keys));
  assert.deepEqual(out, keys);
});

test("unkeys keeps a section that had its own bindings", () => {
  const keys = { "layout:endor-grid": { "cmd-k": "x" } };
  const out = removeLayoutKeys(addLayoutKeys(keys));
  assert.deepEqual(out, keys);
});

test("inputs are not mutated", () => {
  const before = JSON.stringify(existing);
  addHooks(existing, CMD);
  removeHooks(existing, CMD);
  assert.equal(JSON.stringify(existing), before);
});

test("the kit binds no cmd-shift-j: the day view's add-on does", () => {
  assert.equal(addLayoutKeys({}).global["cmd-shift-j"], undefined);
  const keys = { global: { "cmd-shift-j": "tab.new" } };
  assert.equal(addLayoutKeys(keys).global["cmd-shift-j"], "tab.new");
  assert.deepEqual(layoutKeyNotices(keys), [], "someone else's key is no news to the kit");
  assert.equal(removeLayoutKeys(keys).global["cmd-shift-j"], "tab.new");
  const added = { global: { "cmd-shift-j": "herdr-signals.press-day" } };
  assert.deepEqual(layoutKeyNotices(added), []);
  assert.deepEqual(addLayoutKeys(added).global, { ...addLayoutKeys({}).global, "cmd-shift-j": "herdr-signals.press-day" }, "an add-on's binding stays");
  assert.equal(removeLayoutKeys(added).global["cmd-shift-j"], "herdr-signals.press-day", "the kit's uninstall leaves it to the add-on");
});

test("an event written Name:async gets async: true, and a bare name clears it", () => {
  const out = addHooks(existing, CMD, ["Stop", "PreToolUse:async"]);
  const ours = (s, ev) => s.hooks[ev].flatMap((e) => e.hooks).find((h) => h.command === CMD);
  assert.equal(ours(out, "PreToolUse").async, true);
  assert.equal("async" in ours(out, "Stop"), false);
  assert.equal(out.hooks.PreToolUse[0].hooks[0].async, undefined, "the user's own guard.sh is untouched");
  assert.deepEqual(addHooks(out, CMD, ["Stop", "PreToolUse:async"]), out, "idempotent");
  const back = addHooks(out, CMD, ["Stop", "PreToolUse"]);
  assert.equal("async" in ours(back, "PreToolUse"), false);
  assert.deepEqual(removeHooks(out, CMD), existing);
});

// The bindings each scene's pair of layouts had before the one layout.
const sceneKeys = (s) => ({
  [`layout:${s}`]: { "cmd-shift-g": { command: "layout.switch", args: { name: `${s}-grid` } } },
  [`layout:${s}-grid`]: {
    "cmd-shift-g": { command: "layout.switch", args: { name: s } },
    "cmd-alt-]": "herdr-signals.spot-next",
    "cmd-alt-[": "herdr-signals.spot-prev",
    "cmd-shift-a": "herdr-signals.grid-all",
  },
});

test("the old per-scene sections go when they hold exactly the old bindings", () => {
  const old = { global: { "cmd-q": "app.quit" } };
  for (const s of ["tatooine", "endor", "hoth", "dagobah", "coruscant", "bespin", "naboo", "scarif", "kamino", "small-moon"]) Object.assign(old, sceneKeys(s));
  const out = addLayoutKeys(old);
  assert.deepEqual(Object.keys(out).sort(), ["global", "layout:scruffy"]);
  assert.equal(out["layout:scruffy"]["cmd-shift-g"], "herdr-signals.view-toggle");
  assert.deepEqual(layoutKeyNotices(old), []);
  assert.deepEqual(removeLayoutKeys(old), { global: { "cmd-q": "app.quit" } });
});

test("after keys, layout:endor-grid is gone and layout:scruffy toggles the view", () => {
  const out = addLayoutKeys(sceneKeys("endor"));
  assert.equal(out["layout:endor-grid"], undefined);
  assert.equal(out["layout:endor"], undefined);
  assert.equal(out["layout:scruffy"]["cmd-shift-g"], "herdr-signals.view-toggle");
});

test("a user-edited old scene binding stays, with a notice", () => {
  const keys = { "layout:endor": { "cmd-shift-g": "tab.new" }, ...{ "layout:endor-grid": sceneKeys("endor")["layout:endor-grid"] } };
  const out = addLayoutKeys(keys);
  assert.deepEqual(out["layout:endor"], { "cmd-shift-g": "tab.new" });
  assert.equal(out["layout:endor-grid"], undefined);
  const notes = layoutKeyNotices(keys).join("\n");
  assert.match(notes, /layout:endor\b.*cmd-shift-g/);
  assert.doesNotMatch(notes, /layout:endor-grid/);
});

test("the old kit and kit-grid bindings go, a user's own stay", () => {
  const old = {
    "layout:kit": { "cmd-shift-g": { command: "layout.switch", args: { name: "kit-grid" } } },
    "layout:kit-grid": { "cmd-shift-g": { command: "layout.switch", args: { name: "kit" } }, "cmd-alt-]": "herdr-signals.spot-next", "cmd-k": "x" },
  };
  const out = addLayoutKeys(old);
  assert.equal(out["layout:kit"], undefined);
  assert.deepEqual(out["layout:kit-grid"], { "cmd-k": "x" });
  assert.deepEqual(removeLayoutKeys(old), { "layout:kit-grid": { "cmd-k": "x" } });
});

test("cmd-shift-f toggles focus mode; a user binding on it is left alone", () => {
  assert.equal(addLayoutKeys({}).global["cmd-shift-f"], "herdr-signals.focus");
  const keys = { global: { "cmd-shift-f": "tab.new" } };
  assert.equal(addLayoutKeys(keys).global["cmd-shift-f"], "tab.new");
});

test("a keep list keeps those old layouts' sections and drops the rest", () => {
  const old = { global: { "cmd-q": "app.quit" } };
  const all = ["tatooine", "endor", "hoth", "dagobah", "coruscant", "bespin", "naboo", "scarif", "kamino", "small-moon"];
  for (const s of all) Object.assign(old, sceneKeys(s));
  const out = addLayoutKeys(old, ["small-moon", "small-moon-grid"]);
  assert.deepEqual(out["layout:small-moon"], old["layout:small-moon"]);
  assert.deepEqual(out["layout:small-moon-grid"], old["layout:small-moon-grid"]);
  const left = Object.keys(out).filter((k) => k.startsWith("layout:") && k !== "layout:scruffy").sort();
  assert.deepEqual(left, ["layout:small-moon", "layout:small-moon-grid"], "the other 18 go");
  assert.equal(out["layout:scruffy"]["cmd-shift-g"], "herdr-signals.view-toggle");
  assert.deepEqual(addLayoutKeys(out), addLayoutKeys(old), "a later run without the keep list drops them");
});

test("cmd-shift-s opens the picker on the kit layout and switches to it elsewhere", () => {
  const out = addLayoutKeys({});
  assert.equal(out["layout:scruffy"]["cmd-shift-s"], "herdr-signals.scenes");
  assert.deepEqual(out.global["cmd-shift-s"], TO_KIT);
  assert.deepEqual(addLayoutKeys(out), out);
});

test("a user binding on cmd-shift-s is left alone", () => {
  const keys = { global: { "cmd-shift-s": "tab.new" } };
  assert.equal(addLayoutKeys(keys).global["cmd-shift-s"], "tab.new");
  assert.match(layoutKeyNotices(keys).join("\n"), /global cmd-shift-s/);
  assert.deepEqual(removeLayoutKeys(addLayoutKeys({ global: { "cmd-q": "app.quit" } })), { global: { "cmd-q": "app.quit" } });
});

test("an old install's cmd-shift-j (herdr-signals.day) is dropped, quietly", () => {
  const keys = { global: { "cmd-shift-j": "herdr-signals.day", "cmd-q": "app.quit" } };
  assert.deepEqual(layoutKeyNotices(keys), []);
  const out = addLayoutKeys(keys);
  assert.equal(out.global["cmd-shift-j"], undefined);
  assert.equal(out.global["cmd-q"], "app.quit");
  assert.equal(removeLayoutKeys(keys).global["cmd-shift-j"], undefined, "uninstall drops the old binding too");
});

const PRIVATE_KEYS = { global: { "cmd-shift-j": "herdr-signals.press-day" } };

test("a bindings table: free keys bound, a user's left alone with a notice, only its own removed", () => {
  const out = addTableKeys({ global: { "cmd-q": "app.quit" } }, PRIVATE_KEYS);
  assert.deepEqual(out.global, { "cmd-q": "app.quit", "cmd-shift-j": "herdr-signals.press-day" });
  assert.deepEqual(addTableKeys(out, PRIVATE_KEYS), out, "idempotent");
  assert.deepEqual(tableKeyNotices(out, PRIVATE_KEYS), []);
  const mine = { global: { "cmd-shift-j": "tab.new" } };
  assert.deepEqual(addTableKeys(mine, PRIVATE_KEYS), mine);
  assert.match(tableKeyNotices(mine, PRIVATE_KEYS).join("\n"), /left global cmd-shift-j alone: it is bound to tab\.new/);
  assert.deepEqual(removeTableKeys(mine, PRIVATE_KEYS), mine);
  assert.deepEqual(removeTableKeys(out, PRIVATE_KEYS), { global: { "cmd-q": "app.quit" } });
  assert.deepEqual(addLayoutKeys(out).global["cmd-shift-j"], "herdr-signals.press-day", "the kit's keys step keeps it");
});

test("a bindings table must be sections of key -> action", () => {
  assert.deepEqual(bindingsTable(PRIVATE_KEYS), PRIVATE_KEYS);
  assert.equal(bindingsTable([]), null);
  assert.equal(bindingsTable({ global: [] }), null);
  assert.equal(bindingsTable({ global: { k: 3 } }), null);
  assert.deepEqual(bindingsTable({ global: { k: { command: "x" } } }), { global: { k: { command: "x" } } });
});

const OLD_KIT_KEYS = {
  "cmd-shift-g": "herdr-signals.view-toggle",
  "cmd-shift-s": "herdr-signals.scenes",
  "cmd-alt-]": "herdr-signals.spot-next",
  "cmd-alt-[": "herdr-signals.spot-prev",
  "cmd-shift-a": "herdr-signals.grid-all",
};

test("keys: a layout:scruffyherdr section holding only kit entries goes, layout:scruffy gets the kit keys", () => {
  const old = { global: { "cmd-q": "app.quit", "cmd-shift-s": { command: "layout.switch", args: { name: "scruffyherdr" } } }, "layout:scruffyherdr": { ...OLD_KIT_KEYS } };
  const out = addLayoutKeys(old);
  assert.equal(out["layout:scruffyherdr"], undefined);
  assert.deepEqual(out["layout:scruffy"], OLD_KIT_KEYS);
  assert.deepEqual(out.global["cmd-shift-s"], TO_KIT, "the old global switch to scruffyherdr now switches to scruffy");
  assert.deepEqual(layoutKeyNotices(old), []);
  assert.deepEqual(removeLayoutKeys(old), { global: { "cmd-q": "app.quit" } });
});

test("keys: a user's own key in layout:scruffyherdr moves to layout:scruffy, logged, never lost", () => {
  const old = { "layout:scruffyherdr": { ...OLD_KIT_KEYS, "cmd-k": "x", "cmd-alt-]": "space.next" } };
  const out = addLayoutKeys(old);
  assert.equal(out["layout:scruffyherdr"], undefined);
  assert.equal(out["layout:scruffy"]["cmd-k"], "x");
  assert.equal(out["layout:scruffy"]["cmd-alt-]"], "space.next", "the user's rebinding wins over the kit's");
  assert.equal(out["layout:scruffy"]["cmd-alt-["], "herdr-signals.spot-prev");
  const notes = layoutKeyNotices(old).join("\n");
  assert.match(notes, /moved layout:scruffyherdr cmd-k \(x\) to layout:scruffy/);
  assert.match(notes, /moved layout:scruffyherdr cmd-alt-\] \(space\.next\) to layout:scruffy/);
  assert.deepEqual(addLayoutKeys(out), out, "idempotent");
  assert.deepEqual(layoutKeyNotices(out).filter((n) => n.includes("moved")), []);
});

test("keys: a user key in layout:scruffyherdr that layout:scruffy already binds otherwise stays put, with a notice", () => {
  const old = { "layout:scruffyherdr": { "cmd-k": "x" }, "layout:scruffy": { "cmd-k": "y" } };
  const out = addLayoutKeys(old);
  assert.deepEqual(out["layout:scruffyherdr"], { "cmd-k": "x" });
  assert.equal(out["layout:scruffy"]["cmd-k"], "y");
  assert.match(layoutKeyNotices(old).join("\n"), /left layout:scruffyherdr cmd-k alone/);
});

test("keys: a kept scruffyherdr (the window still shows it) keeps its section untouched", () => {
  const old = { "layout:scruffyherdr": { ...OLD_KIT_KEYS, "cmd-k": "x" } };
  const out = addLayoutKeys(old, ["scruffyherdr"]);
  assert.deepEqual(out["layout:scruffyherdr"], old["layout:scruffyherdr"]);
  assert.equal(out["layout:scruffy"]["cmd-k"], undefined);
  assert.deepEqual(layoutKeyNotices(old, ["scruffyherdr"]).filter((n) => n.includes("scruffyherdr")), []);
});

test("keys: kept on scruffyherdr, then landed, a user's rebinding of a kit key still moves over the kit's default", () => {
  const old = { "layout:scruffyherdr": { ...OLD_KIT_KEYS, "cmd-alt-]": "space.next", "cmd-k": "x" } };
  const kept = addLayoutKeys(old, ["scruffyherdr"]);
  assert.equal(kept["layout:scruffy"]["cmd-alt-]"], "herdr-signals.spot-next", "the kept run binds the kit default");
  const landed = addLayoutKeys(kept);
  assert.equal(landed["layout:scruffyherdr"], undefined, "nothing stranded");
  assert.equal(landed["layout:scruffy"]["cmd-alt-]"], "space.next");
  assert.equal(landed["layout:scruffy"]["cmd-k"], "x");
  assert.deepEqual(landed, addLayoutKeys(old), "the same outcome as landing straight away");
  assert.match(layoutKeyNotices(kept).join("\n"), /moved layout:scruffyherdr cmd-alt-\] \(space\.next\) to layout:scruffy/);
});
