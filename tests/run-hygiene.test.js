// Run card hygiene: a block stops at its first failing line, an
// action items section is the session's whole open set, the rail's
// open runs list, and a numbered set with a step missing or
// dismissed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "./support/gpui-stub.js";
import { dropRan, hasItems, namesKey, nextRuns, openRunsNote, runCards, runSets, CARD_SPEC } from "../claude/cards.js";
import { readRunState } from "../herdr/mods/herdr-signals/model.js";

const { RUN_NOTE, runArgv, runStatus, goLabel, ranAgo, planRuns, paneRun, planCounts, gapText, waitsOn, dismissRun, dismissRuns, runKey, visibleRuns } =
  await import("../herdr/mods/kit-rail/look.js");

const F = "```";
const AI = "## Your action items";
const HERE = dirname(fileURLToPath(import.meta.url));
const NAME_HOOK = join(HERE, "..", "claude", "name-hook.mjs");
const HAS_ZSH = spawnSync("zsh", ["-c", "true"]).status === 0;
const card = (label, cmd, n = null) => `**▶ Run${n ? ` ${n}` : ""}:** ${label}\n\n${F}sh\n${cmd}\n${F}`;
const items = (...cards) => `Here you go.\n\n${AI}\n\n${cards.join("\n\n")}`;

// --- a failing line stops the block ---

function runBlock(steps) {
  const home = mkdtempSync(join(tmpdir(), "kit-hyg-"));
  const sent = join(home, "sent.log");
  writeFileSync(join(home, "hc"), `#!/bin/sh\nprintf '%s\\n' "$3" >> '${sent}'\n`, { mode: 0o755 });
  const script = runArgv(steps, home, { claude: "t9" })[2];
  const r = spawnSync("zsh", ["-c", script], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, HOME: home, PATH: `${home}:${process.env.PATH}`, HC_TERMINAL_ID: "t42", TMPDIR: home } });
  const dir = join(home, ".config", "herdr-kit", "runstate");
  const states = {};
  if (existsSync(dir)) for (const f of readdirSync(dir)) states[f.replace(/^t9-|\.json$/g, "")] = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const logs = join(home, ".config", "herdr-kit", "runlogs");
  const log = existsSync(logs) ? readdirSync(logs).map((f) => readFileSync(join(logs, f), "utf8")).join("") : "";
  return { r, note: existsSync(sent) ? readFileSync(sent, "utf8").trim() : "", states, log };
}

test("a two-line block whose first line fails stops there and reports that code", { skip: !HAS_ZSH }, () => {
  const { r, note, states, log } = runBlock([{ id: "m1", label: "merge it", command: "sh -c 'exit 4'\necho SHOULD-NOT-RUN" }]);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(log, /SHOULD-NOT-RUN/);
  assert.deepEqual([states.m1.state, states.m1.exit], ["done", 4]);
  assert.match(note, new RegExp(`^${RUN_NOTE.replace(/[[\]]/g, "\\$&")} finished: "merge it" exited 4\\.`));
});

test("a failure in a sequence's middle line stops the step and skips the rest", { skip: !HAS_ZSH }, () => {
  const { note, states, log } = runBlock([
    { id: "a1", label: "go in", command: "mkdir -p sub\ncd sub", step: 1, of: 2 },
    { id: "a2", label: "check", command: "echo in-$(basename $PWD)\nfalse\necho SHOULD-NOT-RUN", step: 2, of: 2 },
  ]);
  assert.match(log, /in-sub/, "a cd still carries to the next step");
  assert.doesNotMatch(log, /SHOULD-NOT-RUN/);
  assert.deepEqual([states.a1.exit, states.a2.exit], [0, 1]);
  assert.match(note, /1\/2 "go in" exit 0; 2\/2 "check" exit 1\./);
});

test("a guarded failure, a condition and a clean block still run on", { skip: !HAS_ZSH }, () => {
  const { states, log } = runBlock([{ id: "g1", label: "guarded", command: "false || true\nif false; then echo no; fi\n[ -e /nope ] && echo no\necho REACHED" }]);
  assert.match(log, /REACHED/);
  assert.equal(states.g1.exit, 0);
});

test("the card rules say a failing line stops the block", () => {
  assert.match(CARD_SPEC, /stops at the first line that fails/);
  assert.match(CARD_SPEC, /\|\| true/);
});

// --- the action items section is the whole open set ---

test("a section drops the cards it leaves out; a message without one keeps them", () => {
  const first = nextRuns([], items(card("create the App Group", "make group", "1/2"), card("archive the build", "make archive", "2/2")));
  assert.deepEqual(first.map((r) => r.label), ["create the App Group", "archive the build"]);
  // Prose only: the set stays.
  assert.deepEqual(nextRuns(first, "Still working on it."), first);
  // A later message relabels and withdraws: the old cards leave.
  const later = nextRuns(first, items(card("deploy both sites", "make deploy")));
  assert.deepEqual(later.map((r) => r.label), ["deploy both sites"]);
  // A section with only an Ask card still names the open set: no Run cards.
  assert.deepEqual(nextRuns(first, `${AI}\n\n**? Ask:** which box?`), []);
});

test("a card listed again unchanged keeps its id; a changed command is a new card", () => {
  const first = nextRuns([], items(card("list", "ls"), card("where", "pwd")));
  const again = nextRuns(first, items(card("list", "ls"), card("where", "pwd -P")));
  assert.equal(again[0].id, first[0].id, "unchanged: same card, so its result stays");
  assert.notEqual(again[1].id, first[1].id, "a new command is a new card");
  assert.equal(again[1].command, "pwd -P");
});

test("a closing card without a section joins the set", () => {
  const first = nextRuns([], items(card("list", "ls")));
  const next = nextRuns(first, card("build", "npm run build"));
  assert.deepEqual(next.map((r) => r.label), ["list", "build"]);
  assert.equal(hasItems(card("build", "x")), false);
  assert.equal(hasItems(items(card("build", "x"))), true);
});

function hookRig() {
  const home = mkdtempSync(join(tmpdir(), "kit-hyg-home-"));
  const transcript = join(home, "t.jsonl");
  writeFileSync(transcript, "");
  const file = join(home, ".config", "herdr-kit", "names", "term1.json");
  const hook = (input) => spawnSync("node", [NAME_HOOK], { input: JSON.stringify({ session_id: "s", transcript_path: transcript, ...input }), env: { ...process.env, HOME: home, HC_TERMINAL_ID: "term1", CLAUDE_JOB_DIR: "", CLAUDE_CODE_SESSION_KIND: "" }, encoding: "utf8" });
  const ran = (id, exit) => {
    const dir = join(home, ".config", "herdr-kit", "runstate");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `term1-${id}.json`), JSON.stringify({ state: "done", exit, at: 1 }));
  };
  return { hook, ran, read: () => JSON.parse(readFileSync(file, "utf8")) };
}

test("the name hook drops a withdrawn numbered set at the next section, across turns", () => {
  const { hook, read } = hookRig();
  hook({ hook_event_name: "Stop", last_assistant_message: items(card("create the App Group", "make group", "1/3"), card("archive the build", "make archive", "2/3"), card("deploy both sites", "make deploy", "3/3")) });
  assert.equal(read().runs.length, 3);
  hook({ hook_event_name: "UserPromptSubmit", prompt: "the archive is blocked by WIND-409" });
  hook({ hook_event_name: "Stop", last_assistant_message: "Looking into it." });
  assert.equal(read().runs.length, 3, "a message without a section keeps the set");
  hook({ hook_event_name: "UserPromptSubmit", prompt: "ok" });
  hook({ hook_event_name: "Stop", last_assistant_message: items(card("deploy the site", "make deploy-site")) });
  assert.deepEqual(read().runs.map((r) => r.label), ["deploy the site"], "the withdrawn steps are gone");
  assert.equal(read().card, "run");
});

test("a Run note's reply with a section names the open set too", () => {
  const { hook, read } = hookRig();
  hook({ hook_event_name: "Stop", last_assistant_message: items(card("list", "ls"), card("where", "pwd")) });
  const [list] = read().runs;
  hook({ hook_event_name: "UserPromptSubmit", prompt: `${RUN_NOTE} finished: "where" exited 0. Output: x.log` });
  hook({ hook_event_name: "Stop", last_assistant_message: items(card("list", "ls"), card("next", "echo next")) });
  assert.deepEqual(read().runs.map((r) => r.label), ["list", "next"]);
  assert.equal(read().runs[0].id, list.id);
});

test("the section before a menu names the open set while the menu is up", () => {
  const { hook, read } = hookRig();
  const say = (text) => JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } });
  hook({ hook_event_name: "Stop", last_assistant_message: items(card("old", "echo old")) });
  hook({ hook_event_name: "UserPromptSubmit", prompt: "next" });
  const t =join(mkdtempSync(join(tmpdir(), "kit-hyg-t-")), "t.jsonl");
  writeFileSync(t, [JSON.stringify({ type: "user", message: { role: "user", content: "next" } }), say(items(card("new", "echo new")))].join("\n") + "\n");
  hook({ hook_event_name: "PreToolUse", tool_name: "AskUserQuestion", tool_input: {}, transcript_path: t });
  assert.deepEqual(read().runs.map((r) => r.label), ["new"]);
  assert.equal(read().card, "decide");
});

// --- the open runs list ---

test("a card posted again with the same label and command updates the one card", () => {
  const first = nextRuns([], items(card("list", "ls")));
  const twice = nextRuns(first, items(card("list", "ls"), card("list", "ls")));
  assert.equal(twice.length, 1);
  assert.equal(twice[0].id, first[0].id);
  const kept = nextRuns(first, card("list", "ls"));
  assert.equal(kept.length, 1, "a closing card the same as an open one doesn't double it");
});

test("a failed run stays open with its exit and a Retry; a clean one moves to done with its time", () => {
  const failed = { state: "done", exit: 2, ended: 1_000 };
  assert.deepEqual(runStatus(failed), { text: "✗ exited 2", tone: "bad" });
  assert.equal(goLabel(runStatus(failed)), "▶ Retry");
  assert.equal(goLabel(null), "▶ Run");
  assert.equal(goLabel(runStatus({ state: "skipped" })), "▶ Run");
  assert.equal(ranAgo({ state: "done", exit: 0, ended: 1_000 }, 181_000), "3m ago");
  assert.equal(ranAgo({ state: "done", exit: 0 }), null);
  assert.equal(readRunState({ state: "done", exit: 0, at: 5 }).ended, 5_000);
  assert.equal(readRunState({ state: "running", at: 5 }).ended, null);
  const a = { address: "t1", runs: [
    { id: "c", label: "clean", command: "x", state: { state: "done", exit: 0, ended: 1 } },
    { id: "f", label: "failed", command: "y", state: failed },
    { id: "n", label: "new", command: "z", state: null },
  ] };
  const plan = planRuns(a, {});
  assert.deepEqual(plan.map((g) => (g.card ? g.card.id : g.done.map((r) => r.id).join())), ["f", "n", "c"], "the clean card goes last, under done");
  assert.deepEqual(planCounts(plan), { open: 2, done: 1 });
});

test("Clear dismisses every card of the Claude, and only its cards", () => {
  const a = { address: "t1", runs: [{ id: "x", label: "x", command: "1" }, { id: "y", label: "y", command: "2" }] };
  const b = { address: "t2", runs: [{ id: "z", label: "z", command: "3" }] };
  const d = dismissRuns(dismissRun({}, [a, b], "t2", b.runs[0]), [a, b], "t1", a.runs);
  assert.deepEqual(visibleRuns(a, d), []);
  assert.deepEqual(visibleRuns(b, d), []);
  assert.deepEqual(Object.keys(dismissRuns({}, [a, b], "t1", a.runs)).sort(), [runKey("t1", a.runs[0]), runKey("t1", a.runs[1])].sort());
  assert.deepEqual(planRuns(a, d), []);
});

test("Claude reads the open set, with each card's last run", () => {
  assert.equal(openRunsNote([]), null);
  const note = openRunsNote([
    { id: "a", label: "deploy", command: "x", step: 1, of: 2 },
    { id: "b", label: "check", command: "y", step: 2, of: 2 },
    { id: "c", label: "open\nit", command: "z" },
  ], { a: { state: "done", exit: 0 }, b: { state: "done", exit: 3 } });
  assert.equal(note, [
    "[herdr-kit] Your Run cards on the rail, with each one's last run:",
    '- 1/2 "deploy" · ✓ exit 0',
    '- 2/2 "check" · ✗ exit 3',
    '- "open it" · not run',
    "Your next action items section replaces this set: list each card still needed, unchanged to keep its result. A card you leave out leaves the rail.",
  ].join("\n"));
  assert.match(CARD_SPEC, /Your Run cards on the rail/);
});

test("namesKey: the terminal, a background session's bg-<id>, or null", () => {
  assert.equal(namesKey({ HC_TERMINAL_ID: "t1" }, "s"), "t1");
  assert.equal(namesKey({ HC_TERMINAL_ID: "t1", CLAUDE_JOB_DIR: "/j" }, "ab-12"), "bg-ab-12");
  assert.equal(namesKey({ HC_TERMINAL_ID: "t1", CLAUDE_CODE_SESSION_KIND: "bg" }, "../x"), null);
  assert.equal(namesKey({}, "s"), null);
  assert.equal(namesKey({ HC_TERMINAL_ID: "a b" }, "s"), null);
});

// --- a numbered set with a step gone ---

const step = (n, of, state = null, id = `s${n}`) => ({ id, label: `step ${n}`, command: `echo ${n}`, step: n, of, state });
const CLEAN = { state: "done", exit: 0 };
const lone = { id: "lone", label: "lone", command: "ls" };

test("a dismissed first step blocks the rest and drops Run all, in the rail and the pane", () => {
  const a = { address: "t1", runs: [lone, step(1, 2), step(2, 2)] };
  const d = dismissRun({}, [a], "t1", a.runs[1]);
  const plan = planRuns(a, d);
  assert.deepEqual(plan[0], { card: lone }, "the card on its own is untouched");
  const g = plan[1];
  assert.deepEqual(g.seq.map((r) => r.id), ["s2"]);
  assert.deepEqual(g.gaps, [{ step: 1, why: "dismissed" }]);
  assert.equal(g.wait, 1);
  assert.equal(waitsOn(g, g.seq[0]), true);
  assert.equal(gapText(g.gaps), "step 1 dismissed");
  // The pane header offers the lone card first, then the waiting step with no Run.
  assert.deepEqual(paneRun(plan), { card: lone, all: null, wait: null });
  assert.deepEqual(paneRun(planRuns({ address: "t1", runs: a.runs.slice(1) }, d)), { card: a.runs[2], all: null, wait: 1 });
});

test("a missing middle step blocks the steps after it, not the ones before", () => {
  const a = { address: "t1", runs: [step(1, 3), step(3, 3)] };
  const [g] = planRuns(a, {});
  assert.deepEqual(g.gaps, [{ step: 2, why: "missing" }]);
  assert.equal(waitsOn(g, g.seq[0]), false, "step 1 can still run");
  assert.equal(waitsOn(g, g.seq[1]), true);
  assert.deepEqual(paneRun([g]), { card: g.seq[0], all: null, wait: null }, "no Run all while a step is gone");
  assert.equal(gapText([{ step: 1, why: "missing" }, { step: 2, why: "missing" }, { step: 4, why: "dismissed" }]), "steps 1, 2 missing · step 4 dismissed");
});

test("a step that ran clean is done, not a gap, even when dismissed", () => {
  const a = { address: "t1", runs: [step(1, 2, CLEAN), step(2, 2)] };
  const whole = planRuns(a, {});
  assert.deepEqual(whole[0].gaps, []);
  assert.equal(whole[0].wait, null);
  assert.deepEqual(paneRun(whole), { card: a.runs[1], all: null, wait: null }, "step 2 runs; Run all only from the set's first shown step");
  const d = dismissRun({}, [a], "t1", a.runs[0]);
  const [g] = planRuns(a, d);
  assert.deepEqual(g.gaps, []);
  assert.deepEqual(paneRun([g]), { card: a.runs[1], all: [a.runs[1]], wait: null });
  // A whole set from its first step offers Run all.
  const fresh = { address: "t1", runs: [step(1, 2), step(2, 2)] };
  assert.deepEqual(paneRun(planRuns(fresh, {})).all, fresh.runs);
});

test("a done step stays while its set is open, so it reads as done, not missing", () => {
  const runs = [step(1, 2), step(2, 2), lone];
  assert.deepEqual(dropRan(runs, new Set(["s1"])).map((r) => r.id), ["s1", "s2", "lone"], "s1 stays beside open s2");
  assert.deepEqual(dropRan(runs, new Set(["s1", "s2", "lone"])), [], "a set that all ran clean goes");
  assert.deepEqual(runSets(runs).map((s) => s.map((r) => r.id)), [["s1", "s2"]]);
  // A message that lists only the rest of a set keeps its done step 1 before them.
  const kept = nextRuns([], items(card("one", "echo 1", "1/2"), card("two", "echo 2", "2/2")));
  const after = nextRuns(kept, items(card("two", "echo 2", "2/2")), new Set([kept[0].id]));
  assert.deepEqual(after.map((r) => r.id), [kept[0].id, kept[1].id]);
  // Not done: it isn't kept, so the set shows it missing.
  assert.deepEqual(nextRuns(kept, items(card("two", "echo 2", "2/2"))).map((r) => r.id), [kept[1].id]);
});

test("the rail and the pane both draw from planRuns", () => {
  const rail = readFileSync(join(HERE, "..", "herdr", "mods", "kit-rail", "main.js"), "utf8");
  const pane = readFileSync(join(HERE, "..", "herdr", "mods", "kit-pane", "main.js"), "utf8");
  assert.match(rail, /planRuns\(a, shared\("kit\.runsDismissed"\)\)/);
  assert.match(rail, /waitsOn\(g, r\)/);
  assert.match(pane, /paneRun\(planRuns\(kit, shared\("kit\.runsDismissed"\)\)\)/);
  assert.doesNotMatch(rail + pane, /groupRuns/);
});

test("runCards reads numbered steps the way runSets groups them", () => {
  const runs = runCards(items(card("a", "1", "1/2"), card("b", "2", "2/2"), card("c", "3")));
  assert.deepEqual(runSets(runs).map((s) => s.length), [2]);
});
