#!/usr/bin/env node
// Adds or removes herdr-kit's entries in two files it doesn't own:
//   ~/.claude/settings.json  the Claude hooks (claude/name-hook.mjs), and the
//                            status line wrapper (claude/statusline.mjs; see statusMain)
//   <herdr home>/keys.json   herdr-kit's key bindings (see LAYOUT_KEYS)
// Only our own entries are touched. A key the user bound to something else
// is left alone and reported. Malformed JSON is left alone.
//   node scripts/merge-config.js hooks|unhooks <settings.json> <command> [events] [-- <command> [events]]...
//   (events: comma-separated hook events, each optionally "Name:async"; hooks defaults
//   to all of HOOK_EVENTS, synchronous.
//   Several commands in one call make one backup and one write.)
//   node scripts/merge-config.js hooks-check <settings.json> ...same as hooks...
//   (writes nothing; exit 1 when `hooks` would change the file)
//   node scripts/merge-config.js keys|unkeys <keys.json>
//   (keys: HERDR_KIT_KEEP_LAYOUTS="small-moon small-moon-grid" keeps those old
//   layouts' sections, for old layout files install kept)
//   node scripts/merge-config.js addkeys|rmkeys <keys.json> <bindings.json>
//   (another table of bindings, {section: {key: action}}, such as private/keys.json,
//   added or removed on the same terms)
//   node scripts/merge-config.js wrapstatus|unwrapstatus|statusstate ...  (see statusMain)
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KIT_LAYOUT, LEGACY_SCENES, OLD_KIT_LAYOUT } from "../herdr/mods/herdr-signals/scenes.js";

export const HOOK_EVENTS = [
  "SessionStart", "UserPromptSubmit", "Stop", "Notification", "PermissionRequest", "PreToolUse",
];

// Section -> key -> action. A string action is a Herdr command or a mod command.
// The one kit layout toggles its view in place (herdr-signals swaps focus and grid).
const SCENE_NAMES = LEGACY_SCENES;
const GRID_KEYS = {
  "cmd-alt-]": "herdr-signals.spot-next",
  "cmd-alt-[": "herdr-signals.spot-prev",
  "cmd-shift-a": "herdr-signals.grid-all",
};
// A mod command reaches only a shown copy of the mod, and other layouts show
// no herdr-signals, so off the kit layout cmd-shift-s switches to it instead
// of opening the scene picker (layout:<name> beats global).
const LAYOUT_KEYS = {
  [`layout:${KIT_LAYOUT}`]: { "cmd-shift-g": "herdr-signals.view-toggle", "cmd-shift-s": "herdr-signals.scenes", ...GRID_KEYS },
  global: {
    "cmd-shift-u": "herdr-signals.urgent",
    "cmd-shift-f": "herdr-signals.focus",
    "cmd-shift-s": { command: "layout.switch", args: { name: KIT_LAYOUT } },
  },
};
/** The kit's own bindings, {section: {key: action}}: the gallery's herdr/keys.json is this, generated (make-layout.js --gallery-keys). */
export function kitKeys() {
  return JSON.parse(JSON.stringify(LAYOUT_KEYS));
}
// Bindings from older installs, removed by both keys and unkeys when they
// still hold exactly these: each scene's focus and grid layouts (before the
// one layout), and before scenes, "kit" and "kit-grid"; the one layout's
// under its old name (OLD_KIT_LAYOUT); and the day view's key from before the
// day view became an add-on (its add-on binds it now).
const LEGACY_KEYS = {
  global: {
    "cmd-shift-j": "herdr-signals.day",
    "cmd-shift-s": { command: "layout.switch", args: { name: OLD_KIT_LAYOUT } },
  },
  [`layout:${OLD_KIT_LAYOUT}`]: { "cmd-shift-g": "herdr-signals.view-toggle", "cmd-shift-s": "herdr-signals.scenes", ...GRID_KEYS },
  ...Object.fromEntries(SCENE_NAMES.flatMap((s) => [
    [`layout:${s}`, { "cmd-shift-g": { command: "layout.switch", args: { name: `${s}-grid` } } }],
    [`layout:${s}-grid`, { "cmd-shift-g": { command: "layout.switch", args: { name: s } }, ...GRID_KEYS }],
  ])),
  "layout:kit": {
    "cmd-shift-g": { command: "layout.switch", args: { name: "kit-grid" } },
  },
  "layout:kit-grid": {
    "cmd-shift-g": { command: "layout.switch", args: { name: "kit" } },
    ...GRID_KEYS,
  },
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const describe = (action) => (typeof action === "string" ? action : JSON.stringify(action));

// The hook command used to be stored unquoted. Older installs still have that
// form, so it counts as ours too and is rewritten to the quoted form.
const legacyOf = (command) => command.replace(/^node "([^"]*)"$/, "node $1");
const isOurs = (command) => (h) =>
  h && h.type === "command" && (h.command === command || h.command === legacyOf(command));

/** "PreToolUse:async" to {ev: "PreToolUse", async: true}; a bare name is synchronous. */
export function parseEvent(token) {
  const [ev, flag] = String(token).split(":");
  return { ev, async: flag === "async" };
}

/**
 * Adds one hook entry per event for `command`; idempotent. An event written
 * "Name:async" gets `"async": true`, so Claude Code runs it in the background
 * instead of waiting on it; a bare name drops a stale `async` from our entry.
 */
export function addHooks(settings, command, events = HOOK_EVENTS) {
  const out = structuredClone(settings);
  out.hooks = out.hooks ?? {};
  for (const token of events) {
    const { ev, async } = parseEvent(token);
    const entries = out.hooks[ev] ?? [];
    let found = false;
    for (const e of entries) {
      for (const h of e.hooks ?? []) {
        if (isOurs(command)(h)) {
          h.command = command;
          if (async) h.async = true;
          else delete h.async;
          found = true;
        }
      }
    }
    if (!found) entries.push({ hooks: [{ type: "command", command, ...(async ? { async: true } : {}) }] });
    out.hooks[ev] = entries;
  }
  return out;
}

/** Removes every hook entry for `command`, and any container left empty by that. */
export function removeHooks(settings, command) {
  const out = structuredClone(settings);
  if (!out.hooks) return out;
  for (const ev of Object.keys(out.hooks)) {
    const entries = out.hooks[ev]
      .map((e) => ({ ...e, hooks: (e.hooks ?? []).filter((h) => !isOurs(command)(h)) }))
      .filter((e, i) => e.hooks.length > 0 || (settings.hooks[ev][i].hooks ?? []).length === 0);
    if (entries.length) out.hooks[ev] = entries;
    else delete out.hooks[ev];
  }
  if (Object.keys(out.hooks).length === 0) delete out.hooks;
  return out;
}

// The one layout's section under its old name, and under its name now.
const OLD_SECTION = `layout:${OLD_KIT_LAYOUT}`;
const KIT_SECTION = `layout:${KIT_LAYOUT}`;

/**
 * The user's own keys left in the old-name section once our old bindings
 * are dropped from `keys`: each moves to the kit section when that key is
 * free there, already the same, or still on the kit's own default (a kept
 * run bound it: the user's override replaces it), else stays. None when `keep` names the
 * old layout (the window may still show it).
 * @returns {{key, action, move: boolean, current}[]}
 */
function oldSectionMoves(keys, keep = []) {
  if (keep.includes(OLD_KIT_LAYOUT)) return [];
  const old = dropKeys(keys, LEGACY_KEYS)[OLD_SECTION];
  if (!old || typeof old !== "object") return [];
  return Object.entries(old).map(([key, action]) => {
    const current = keys[KIT_SECTION]?.[key];
    const kitDefault = LAYOUT_KEYS[KIT_SECTION]?.[key];
    const free = current === undefined || same(current, action) || (kitDefault !== undefined && same(current, kitDefault));
    return { key, action, current, move: free };
  });
}

/** `keys` (dropped of our old bindings) with the user's own old-name keys moved to the kit section. */
function moveOldSection(keys, moves) {
  const out = structuredClone(keys);
  for (const { key, action, move } of moves) {
    if (!move) continue;
    out[KIT_SECTION] = out[KIT_SECTION] ?? {};
    out[KIT_SECTION][key] = structuredClone(action);
    delete out[OLD_SECTION][key];
  }
  if (out[OLD_SECTION] && Object.keys(out[OLD_SECTION]).length === 0) delete out[OLD_SECTION];
  return out;
}

/**
 * Binds each of our keys that is free; a key bound to anything else stays as
 * the user has it. `keep` names old layouts whose files install kept (the
 * window may still show one), so their `layout:<name>` sections stay too.
 * The user's own keys in the layout's old-name section move to its section now.
 */
export function addLayoutKeys(keys, keep = []) {
  const out = moveOldSection(dropKeys(keys, LEGACY_KEYS, keep), oldSectionMoves(keys, keep));
  for (const [section, bindings] of Object.entries(LAYOUT_KEYS)) {
    out[section] = out[section] ?? {};
    for (const [key, action] of Object.entries(bindings)) {
      if (out[section][key] === undefined) out[section][key] = structuredClone(action);
    }
  }
  return out;
}

/**
 * One line per key of ours that the user has bound to something else, one
 * per old section's key of ours the user changed (it stays, unused by
 * herdr-kit), and one per user key of the layout's old-name section, moved
 * or left. `keep` as for addLayoutKeys.
 */
export function layoutKeyNotices(keys, keep = []) {
  const notes = [];
  const moves = oldSectionMoves(keys, keep);
  for (const { key, action, move, current } of moves) {
    if (move) notes.push(`moved ${OLD_SECTION} ${key} (${describe(action)}) to ${KIT_SECTION}`);
    else notes.push(`left ${OLD_SECTION} ${key} alone: ${KIT_SECTION} binds it to ${describe(current)} (delete it by hand if you like)`);
  }
  keys = moveOldSection(keys, moves);
  // A key still on its old binding of ours gets the new one: that isn't news.
  const legacy = (section, key, current) => LEGACY_KEYS[section]?.[key] !== undefined && same(current, LEGACY_KEYS[section][key]);
  for (const [section, bindings] of Object.entries(LAYOUT_KEYS)) {
    for (const [key, action] of Object.entries(bindings)) {
      const current = keys[section]?.[key];
      if (current !== undefined && !same(current, action) && !legacy(section, key, current)) {
        notes.push(`left ${section} ${key} alone: it is bound to ${describe(current)} (the kit's is ${describe(action)})`);
      }
    }
  }
  // Only old layout sections: a global key that no longer holds our old binding is simply someone else's.
  for (const [section, bindings] of Object.entries(LEGACY_KEYS)) {
    if (!section.startsWith("layout:") || section === OLD_SECTION) continue;
    for (const [key, action] of Object.entries(bindings)) {
      const current = keys[section]?.[key];
      if (current !== undefined && !same(current, action) && LAYOUT_KEYS[section]?.[key] === undefined) {
        notes.push(`left ${section} ${key} alone: it is bound to ${describe(current)}, and scruffyherdr no longer uses that layout (delete it by hand if you like)`);
      }
    }
  }
  return notes;
}

/** Removes only the bindings that still hold exactly our action; drops a section it leaves empty. */
export function removeLayoutKeys(keys) {
  return dropKeys(dropKeys(keys, LEGACY_KEYS), LAYOUT_KEYS);
}

/** A bindings table ({section: {key: action}}) checked, or null when it isn't one. */
export function bindingsTable(v) {
  const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
  if (!isObj(v)) return null;
  for (const bindings of Object.values(v)) {
    if (!isObj(bindings)) return null;
    for (const action of Object.values(bindings)) if (typeof action !== "string" && !isObj(action)) return null;
  }
  return v;
}

/** Binds each of `table`'s keys that is free; a key bound to anything else stays. */
export function addTableKeys(keys, table) {
  const out = structuredClone(keys);
  for (const [section, bindings] of Object.entries(table)) {
    out[section] = out[section] ?? {};
    for (const [key, action] of Object.entries(bindings)) {
      if (out[section][key] === undefined) out[section][key] = structuredClone(action);
    }
  }
  return out;
}

/** One line per key of `table` the user has bound to something else. */
export function tableKeyNotices(keys, table) {
  const notes = [];
  for (const [section, bindings] of Object.entries(table)) {
    for (const [key, action] of Object.entries(bindings)) {
      const current = keys[section]?.[key];
      if (current !== undefined && !same(current, action)) {
        notes.push(`left ${section} ${key} alone: it is bound to ${describe(current)} (the kit's is ${describe(action)})`);
      }
    }
  }
  return notes;
}

/** Removes `table`'s bindings that still hold exactly its action. */
export function removeTableKeys(keys, table) {
  return dropKeys(keys, table);
}

function dropKeys(keys, table, keep = []) {
  const out = structuredClone(keys);
  const kept = new Set(keep.map((name) => `layout:${name}`));
  for (const [section, bindings] of Object.entries(table)) {
    if (!out[section] || kept.has(section)) continue;
    let removed = false;
    for (const [key, action] of Object.entries(bindings)) {
      if (out[section][key] !== undefined && same(out[section][key], action)) {
        delete out[section][key];
        removed = true;
      }
    }
    if (removed && Object.keys(out[section]).length === 0) delete out[section];
  }
  return out;
}

// The status line wrapper (claude/statusline.mjs): Claude Code gives context use
// only to the status line command, so install wraps the user's line to feed ctx-tap.

/** The exact command install writes; only a status line with this command is the kit's wrapper. */
export function wrapperCommand(nodePath, kitDir) {
  return `${nodePath} "${kitDir}/claude/statusline.mjs"`;
}

/**
 * The kit folder of a command in the wrapper's shape (`<node> "<dir>/claude/statusline.mjs"`),
 * or null. A user's `~/.claude/statusline.mjs` isn't in that shape.
 */
export function wrapperDir(command) {
  const m = /^\S+ "(.+)\/claude\/statusline\.mjs"$/.exec(String(command ?? ""));
  return m ? m[1] : null;
}

/**
 * "wrapped": the command is exactly `wrapper` (wrapperCommand's).
 * "moved": a kit wrapper from another checkout (moved, re-cloned): still the kit's.
 *   Only when `saved` (statusline-prev.json exists, so the kit wrapped this machine
 *   before; the caller checks): without it, a line in that shape is the user's own.
 * "notcommand": a status line that isn't a command one, so it can't feed ctx-tap.
 * "wired": the line names ctx-tap or a claude/statusline.mjs (someone else's
 *   wrapper, ~/.claude/statusline.mjs too), or ctx files were written in the
 *   last day (the caller checks and passes ctxFresh).
 * "unwrapped": anything else, including no status line.
 */
export function statusLineState({ statusLine, ctxFresh, wrapper, saved = false }) {
  const has = statusLine !== undefined && statusLine !== null;
  if (has && (typeof statusLine !== "object" || statusLine.type !== "command" || typeof statusLine.command !== "string")) return "notcommand";
  const command = has ? statusLine.command : "";
  if (wrapper && command === wrapper) return "wrapped";
  if (saved && wrapperDir(command) !== null) return "moved";
  if (ctxFresh || command.includes("ctx-tap") || command.includes("claude/statusline.mjs")) return "wired";
  return "unwrapped";
}

/** Whether install should wrap the status line: only a command line (or none) that doesn't feed ctx-tap yet. */
export function shouldWrap({ statusLine, ctxFresh, wrapper, saved = false }) {
  return statusLineState({ statusLine, ctxFresh, wrapper, saved }) === "unwrapped";
}

/**
 * Points statusLine at the wrapper; `prev` is the old statusLine (null when
 * there was none), to save for the wrapper and for uninstall. Only the old
 * line's padding carries over. Already wrapped: unchanged, prev null.
 */
export function wrapStatusLine(settings, nodePath, kitDir) {
  const command = wrapperCommand(nodePath, kitDir);
  if (settings.statusLine?.command === command) return { settings, prev: null, changed: false };
  const prev = settings.statusLine === undefined ? null : structuredClone(settings.statusLine);
  const out = structuredClone(settings);
  out.statusLine = { type: "command", command, ...(prev?.padding !== undefined ? { padding: prev.padding } : {}) };
  return { settings: out, prev, changed: true };
}

/** Points a moved kit wrapper at this checkout, keeping its other fields. */
export function rewrapStatusLine(settings, nodePath, kitDir) {
  const out = structuredClone(settings);
  out.statusLine = { ...out.statusLine, command: wrapperCommand(nodePath, kitDir) };
  return out;
}

/** Puts `prev` back in statusLine's place, or deletes statusLine when prev is null. */
export function unwrapStatusLine(settings, prev) {
  const out = structuredClone(settings);
  if (prev === null || prev === undefined) delete out.statusLine;
  else out.statusLine = structuredClone(prev);
  return out;
}

/**
 * Copies `file` into `dir`, unless a copy is already there: two writes in the
 * same second share one backup folder, and the first copy (the user's original) wins.
 */
export function backupTo(file, dir) {
  const target = join(dir, basename(file));
  if (existsSync(target)) return;
  mkdirSync(dir, { recursive: true });
  copyFileSync(file, target);
}

function backup(file) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  backupTo(file, join(homedir(), ".config", "herdr-kit", "backup", stamp));
}

// realpath: a folder reached through a symlink (/var -> /private/var) must still run.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [op, file, ...rest] = process.argv.slice(2);
  if (["wrapstatus", "unwrapstatus", "statusstate"].includes(op)) statusMain(op, file, rest);
  const specs = [[]];
  for (const a of rest) a === "--" ? specs.push([]) : specs[specs.length - 1].push(a);
  const command = specs[0][0];
  // addkeys / rmkeys: the bindings table is the next argument.
  let table = null;
  if (op === "addkeys" || op === "rmkeys") {
    try {
      table = bindingsTable(JSON.parse(readFileSync(rest[0], "utf8")));
    } catch {
      table = null;
    }
    if (!table) {
      console.error(`left ${file} alone: ${rest[0]} isn't a bindings table`);
      process.exit(1);
    }
  }
  const keepLayouts = (process.env.HERDR_KIT_KEEP_LAYOUTS ?? "").split(/\s+/).filter(Boolean);
  const evs = (spec) => (spec[1] ? spec[1].split(",").filter(Boolean) : HOOK_EVENTS);
  const ops = {
    hooks: (d) => specs.reduce((acc, sp) => (sp[0] ? addHooks(acc, sp[0], evs(sp)) : acc), d),
    "hooks-check": (d) => specs.reduce((acc, sp) => (sp[0] ? addHooks(acc, sp[0], evs(sp)) : acc), d),
    unhooks: (d) => specs.reduce((acc, sp) => (sp[0] ? removeHooks(acc, sp[0]) : acc), d),
    keys: (d) => addLayoutKeys(d, keepLayouts),
    unkeys: removeLayoutKeys,
    addkeys: (d) => addTableKeys(d, table),
    rmkeys: (d) => removeTableKeys(d, table),
  };
  if (!ops[op] || !file || (op.endsWith("hooks") && !command)) {
    console.error("usage: merge-config.js hooks|hooks-check|unhooks <settings.json> <command> [events] [-- <command> [events]]... | keys|unkeys <keys.json> | addkeys|rmkeys <keys.json> <bindings.json>");
    process.exit(2);
  }
  let data = {};
  if (existsSync(file)) {
    try {
      data = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      console.error(`left ${file} alone: it isn't valid JSON (${e.message})`);
      process.exit(1);
    }
  } else if (op.startsWith("un") || op === "rmkeys") {
    process.exit(0);
  }
  if (op === "keys") for (const note of layoutKeyNotices(data, keepLayouts)) console.log(note);
  if (op === "addkeys") for (const note of tableKeyNotices(data, table)) console.log(note);
  const next = ops[op](data);
  // hooks-check writes nothing: exit 1 when `hooks` would change the file.
  if (op === "hooks-check") process.exit(existsSync(file) && same(next, data) ? 0 : 1);
  if (same(next, data) && existsSync(file)) process.exit(0);
  if (existsSync(file)) backup(file);
  writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
  console.log(`updated ${file}`);
}

// The status line ops. Each exits.
//   wrapstatus <settings.json> <node> <kit dir> <prev file> fresh|stale
//   unwrapstatus <settings.json> <node> <kit dir> <prev file>
//   statusstate <settings.json> <node> <kit dir> fresh|stale [prev file]   (prints wrapped|moved|wired|notcommand|unwrapped)
// <node> <kit dir> name the wrapper's exact command (wrapperCommand).
// fresh|stale: whether a ctx file was written in the last day (install.sh checks).
// HERDR_KIT_NO_BACKUP: install made settings.json moments ago (the hooks step),
// so there is nothing of the user's to keep, and a backup would only add a folder.
function statusMain(op, file, rest) {
  const usage = () => {
    console.error("usage: merge-config.js wrapstatus <settings.json> <node> <kit dir> <prev file> fresh|stale | unwrapstatus <settings.json> <node> <kit dir> <prev file> | statusstate <settings.json> <node> <kit dir> fresh|stale [prev file]");
    process.exit(2);
  };
  const [nodePath, kitDir, third, fourth] = rest;
  if (!file || !nodePath || !kitDir) usage();
  const wrapper = wrapperCommand(nodePath, kitDir);
  const exists = existsSync(file);
  if (op === "unwrapstatus" && !exists) {
    // Nothing to restore into. The saved line stays (it goes only after a restore).
    if (third && existsSync(third)) console.log(`nothing to restore: no ${file} (your old status line stays saved in ${third})`);
    process.exit(0);
  }
  let data = {};
  if (exists) {
    try {
      data = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      console.error(`left ${file} alone: it isn't valid JSON (${e.message})`);
      process.exit(1);
    }
  }
  const write = (next) => {
    if (existsSync(file) && !process.env.HERDR_KIT_NO_BACKUP) backup(file);
    writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
  };
  if (op === "statusstate") {
    console.log(statusLineState({ statusLine: data.statusLine, ctxFresh: third === "fresh", wrapper, saved: Boolean(fourth && existsSync(fourth)) }));
    process.exit(0);
  }
  if (op === "wrapstatus") {
    const prevFile = third;
    if (!prevFile) usage();
    const state = statusLineState({ statusLine: data.statusLine, ctxFresh: fourth === "fresh", wrapper, saved: existsSync(prevFile) });
    if (state === "wrapped") process.exit(0);
    if (state === "moved") {
      // "moved" needs the saved line, which still holds the user's original: keep it.
      write(rewrapStatusLine(data, nodePath, kitDir));
      let had = true;
      try {
        had = JSON.parse(readFileSync(prevFile, "utf8"))?.statusLine != null;
      } catch {
        // unreadable: uninstall will say so; the line is still the kit's
      }
      console.log(had
        ? `status line wrapper moved to this checkout (your old line stays saved in ${prevFile})`
        : "status line wrapper moved to this checkout (you had no status line before it)");
      process.exit(0);
    }
    if (state === "wired") {
      console.log("status line already feeds ctx-tap: left alone");
      process.exit(0);
    }
    if (state === "notcommand") {
      console.log("status line isn't a command: left alone (the context meters need a command status line)");
      process.exit(0);
    }
    const { settings, prev } = wrapStatusLine(data, nodePath, kitDir);
    // The old line is saved before settings.json changes, so a failed write loses nothing.
    mkdirSync(dirname(prevFile), { recursive: true });
    writeFileSync(prevFile, JSON.stringify({ statusLine: prev }, null, 2) + "\n");
    write(settings);
    console.log(prev ? `status line wrapped: it feeds ctx-tap, then runs your old one (saved in ${prevFile})` : "status line set: it feeds ctx-tap (you had none)");
    process.exit(0);
  }
  // unwrapstatus
  const prevFile = third;
  if (!prevFile) usage();
  if (!existsSync(prevFile)) process.exit(0);
  let saved;
  try {
    saved = JSON.parse(readFileSync(prevFile, "utf8"));
    if (saved === null || typeof saved !== "object" || !("statusLine" in saved)) throw new Error("no statusLine");
  } catch (e) {
    console.error(`left the status line alone: ${prevFile} isn't a saved status line (${e.message})`);
    process.exit(1);
  }
  const state = statusLineState({ statusLine: data.statusLine, ctxFresh: false, wrapper, saved: true });
  if (state === "wrapped" || state === "moved") {
    write(unwrapStatusLine(data, saved.statusLine));
    console.log(saved.statusLine ? "restored your old status line" : "removed the kit's status line (you had none)");
    // Only after a restore: a skipped one keeps the saved line.
    rmSync(prevFile, { force: true });
  } else {
    console.log(`left the status line alone: it changed since install (your old one was ${JSON.stringify(saved.statusLine)}, still saved in ${prevFile})`);
  }
  process.exit(0);
}
