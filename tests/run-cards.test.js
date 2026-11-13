import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeCx } from "./support/gpui-stub.js";
import { runCards, runId, mergeRuns, isRunNote, lintMessage } from "../claude/cards.js";
import { initialNamesMemo, resolveNames } from "../herdr/mods/herdr-signals/names.js";
import { attentionStep, buildModel, readRunState } from "../herdr/mods/herdr-signals/model.js";

const look = await import("../herdr/mods/kit-rail/look.js");
const { elapsed, runningText, RUN_NOTE, runArgv, runSlug, runCard, openRunLog, shellQuote, copyCommand, runKey, visibleRuns, dismissRun, runStatus, groupRuns, firstOpenRun, isQuietCommand } =
  await import("../herdr/mods/kit-rail/look.js");
const F = "```";
const AI = "## Your action items";
const NAME_HOOK = join(dirname(fileURLToPath(import.meta.url)), "..", "claude", "name-hook.mjs");
const HAS_ZSH = spawnSync("zsh", ["-c", "true"]).status === 0;
const strip = (r) => r.map(({ id, ...rest }) => rest);

// --- runCards ---

test("runCards: each Run card with a command block, in order, with a stable id", () => {
  const msg = [
    "Done.", "", AI, "",
    "**▶ Run:** start the archive", "", `${F}sh`, "ssh -t host \\", "  'make b56'", F, "", "**Expect:** it uploads", "",
    "**▶ Run:** press the button on the box", "",
    "**▶ Run:** review **PR #115**", "", `${F}bash`, "# open it", "gh pr view 115 --web", F, "",
    "**? Ask:** which box?",
  ].join("\n");
  const runs = runCards(msg);
  assert.deepEqual(strip(runs), [
    { label: "start the archive", command: "ssh -t host \\\n  'make b56'" },
    { label: "review PR #115", command: "# open it\ngh pr view 115 --web" },
  ]);
  assert.equal(runs[0].id, runId("start the archive", "ssh -t host \\\n  'make b56'", msg));
  assert.match(runs[0].id, /^[a-z0-9]{1,16}$/);
  assert.notEqual(runs[0].id, runs[1].id);
});

test("runCards: numbered steps carry step and of", () => {
  const card = (n, c) => `**▶ Run ${n}/2:** s${n}\n\n${F}sh\n${c}\n${F}`;
  const runs = runCards(`${AI}\n\n${card(1, "a")}\n\n${card(2, "b")}\n\n**▶ Run:** lone\n\n${F}sh\nc\n${F}`);
  assert.deepEqual(strip(runs), [
    { label: "s1", command: "a", step: 1, of: 2 },
    { label: "s2", command: "b", step: 2, of: 2 },
    { label: "lone", command: "c" },
  ]);
});

test("runCards: a closing card without the section; code that isn't a command is skipped", () => {
  assert.deepEqual(strip(runCards(`**▶ Run:** build\n\n${F}sh\nnpm run build\n${F}`)), [{ label: "build", command: "npm run build" }]);
  assert.deepEqual(runCards(`${AI}\n\n**▶ Run:** x\n\n${F}python\nprint(1)\n${F}`), []);
  assert.deepEqual(runCards("Fixed it.\n\n```sh\nnpm test\n```\n\nThat's the output."), []);
  assert.deepEqual(runCards(""), []);
});

test("runCards: only the action items section counts when there is one; caps at 8", () => {
  const msg = `**▶ Run:** old\n\n${F}sh\nls\n${F}\n\n${AI}\n\n**▶ Run:** new\n\n${F}sh\npwd\n${F}`;
  assert.deepEqual(strip(runCards(msg)), [{ label: "new", command: "pwd" }]);
  const card = (i) => `**▶ Run:** r${i}\n\n${F}sh\necho ${i}\n${F}`;
  assert.equal(runCards(`${AI}\n\n${Array.from({ length: 10 }, (_, i) => card(i)).join("\n\n")}`).length, 8);
});

test("lint: numbered steps run 1..N, together, each with a command", () => {
  const STEPS = "number steps that run in order ▶ Run 1/N to N/N, next to each other, each with a command block";
  const card = (label, c = "ls") => `${label}\n\n${F}sh\n${c}\n${F}`;
  const ok = `${AI}\n\n${card("**▶ Run 1/2:** a")}\n\n**Expect:** fine\n\n${card("**▶ Run 2/2:** b")}\n\n${card("**▶ Run:** c")}`;
  assert.deepEqual(lintMessage(ok), []);
  for (const bad of [
    `${AI}\n\n${card("**▶ Run 2/2:** a")}\n\n${card("**▶ Run 1/2:** b")}`,
    `${AI}\n\n${card("**▶ Run 1/3:** a")}\n\n${card("**▶ Run 2/3:** b")}`,
    `${AI}\n\n${card("**▶ Run 1/2:** a")}\n\n${card("**▶ Run:** c")}\n\n${card("**▶ Run 2/2:** b")}`,
    `${AI}\n\n${card("**▶ Run 1/2:** a")}\n\n**▶ Run 2/2:** press the button`,
    `${AI}\n\n${card("**▶ Run 1/1:** a")}`,
  ]) assert.ok(lintMessage(bad).includes(STEPS), bad);
});

test("mergeRuns and isRunNote", () => {
  const a = { id: "a", label: "a", command: "x" };
  const b = { id: "b", label: "b", command: "y" };
  assert.deepEqual(mergeRuns([a], [a, b]), [a, b]);
  assert.deepEqual(mergeRuns([a, b], []), [a, b]);
  assert.deepEqual(mergeRuns(undefined, [b]), [b]);
  assert.equal(isRunNote(`${RUN_NOTE} finished: "x" exited 0`), true);
  assert.equal(isRunNote(`  ${RUN_NOTE} all finished: …`), true);
  assert.equal(isRunNote("why did [herdr-kit] ▶ Run fail?"), false);
  assert.equal(isRunNote(undefined), false);
});

// --- names + model ---

const ag = (address, status) => ({ address, status, tab: `tab-${address}`, tab_name: "1", tab_named: false, space: "s1", space_name: "P", seq: 0, focused: false });

test("names: runs pass through with id/step/of; junk entries and fields are dropped", () => {
  const runs = [
    { id: "k1", label: "x", command: "ls", step: 1, of: 2 },
    { id: "BAD ID", label: "y", command: "pwd", step: 3, of: 2 },
    { label: 1, command: "ls" }, { label: "z", command: "  " }, null, "ls",
  ];
  const out = resolveNames(initialNamesMemo(), { agents: [ag("a", "done")], files: { a: { name: "n", at: 1, runs } }, now: 5 });
  assert.deepEqual(out.names.a.runs, [{ id: "k1", label: "x", command: "ls", step: 1, of: 2 }, { label: "y", command: "pwd" }]);
  const junk = resolveNames(initialNamesMemo(), { agents: [ag("a", "done")], files: { a: { name: "n", at: 1, runs: "ls" } }, now: 5 });
  assert.deepEqual(junk.names.a.runs, []);
});

test("model: runs show in every status, each with its run state", () => {
  const runs = [{ id: "k1", label: "x", command: "ls" }, { id: "k2", label: "y", command: "pwd" }, { label: "z", command: "id" }];
  const runstate = { "a-k1": { state: "done", exit: 0, terminal: "t9" } };
  for (const status of ["blocked", "done", "idle", "working"]) {
    const agents = [ag("a", status)];
    const m = buildModel(agents, { a: { name: "n", runs } }, attentionStep({}, agents, 1), "s1", {}, 0, [], {}, runstate);
    assert.deepEqual(m.agents[0].runs.map((r) => r.state), [runstate["a-k1"], null, null], status);
  }
});

test("readRunState: only well-formed states", () => {
  assert.deepEqual(readRunState({ state: "running", exit: null, terminal: "t1", at: 1 }), { state: "running", exit: null, terminal: "t1", log: null, since: 1000 });
  assert.deepEqual(readRunState({ state: "done", exit: 2, at: 5 }), { state: "done", exit: 2, terminal: null, log: null, since: null });
  for (const at of [undefined, null, "9", 0, -1]) assert.equal(readRunState({ state: "running", at }).since, null);
  assert.equal(readRunState({ state: "done", exit: 1, log: "/r/x.log" }).log, "/r/x.log");
  for (const log of ["", 3, null]) assert.equal(readRunState({ state: "done", exit: 1, log }).log, null);
  for (const bad of [null, "x", {}, { state: "done" }, { state: "weird", exit: 0 }]) assert.equal(readRunState(bad), null);
});

// --- rail helpers ---

test("runStatus: words and glyphs, never colour alone", () => {
  assert.equal(runStatus(null), null);
  assert.deepEqual(runStatus({ state: "running" }), { text: "running…", tone: "run" });
  assert.deepEqual(runStatus({ state: "running", since: 1000 }, 43_500), { text: "running 0:42", tone: "run" });
  assert.deepEqual(runStatus({ state: "done", exit: 0 }), { text: "✓ exit 0", tone: "ok" });
  assert.deepEqual(runStatus({ state: "done", exit: 2 }), { text: "✗ exit 2", tone: "bad" });
  assert.deepEqual(runStatus({ state: "done", exit: 130 }), { text: "✗ stopped", tone: "bad" });
  assert.deepEqual(runStatus({ state: "skipped" }), { text: "– skipped", tone: "dim" });
});

test("elapsed: a m:ss clock, h:mm:ss past an hour", () => {
  assert.equal(elapsed(0, 0), "0:00");
  assert.equal(elapsed(0, 59_999), "0:59");
  assert.equal(elapsed(0, 725_000), "12:05");
  assert.equal(elapsed(0, 3_725_000), "1:02:05");
  assert.equal(elapsed(10_000, 0), "0:00");
  assert.equal(runningText(null), "running…");
  assert.equal(runningText({ state: "running", since: 1000 }, 62_000), "running 1:01");
});

test("groupRuns gathers whole sequences; a broken one stays single cards", () => {
  const s = (step, of, id) => ({ id, label: id, command: id, step, of });
  const lone = { id: "l", label: "l", command: "l" };
  assert.deepEqual(groupRuns([lone, s(1, 2, "a"), s(2, 2, "b")]), [{ card: lone }, { seq: [s(1, 2, "a"), s(2, 2, "b")] }]);
  assert.deepEqual(groupRuns([s(1, 3, "a"), s(2, 3, "b")]), [{ card: s(1, 3, "a") }, { card: s(2, 3, "b") }]);
  assert.deepEqual(groupRuns(undefined), []);
});

test("firstOpenRun skips cards that finished with exit 0", () => {
  const ok = { id: "a", state: { state: "done", exit: 0 } };
  const bad = { id: "b", state: { state: "done", exit: 1 } };
  const fresh = { id: "c", state: null };
  assert.equal(firstOpenRun([ok, bad, fresh]), bad);
  assert.equal(firstOpenRun([ok, fresh]), fresh);
  assert.equal(firstOpenRun([ok]), null);
});

// --- the run script ---

test("shellQuote and runArgv: the folder is quoted, the steps run under script, the shell closes, no note without a Claude", () => {
  assert.equal(shellQuote("it's"), `'it'\\''s'`);
  const [sh, flag, script] = runArgv([{ label: "x", command: "ls\npwd" }], "/home/b/it's here");
  assert.deepEqual([sh, flag], ["zsh", "-lc"]);
  assert.ok(script.includes("cd -- '/home/b/it'\\''s here' 2>/dev/null\n"));
  assert.ok(script.includes("trap : INT\nls\npwd\n__kit_rc=$?"));
  assert.match(script, /\nscript -q "\$__kit_tmp\/raw" zsh -c '/);
  assert.match(script, /\nexit 0$/);
  assert.doesNotMatch(script, /exec zsh/);
  assert.doesNotMatch(script, /hc send/);
  assert.doesNotMatch(runArgv([{ label: "x", command: "ls" }], null)[2], /cd --/);
});

/**
 * Runs runArgv's script in zsh with a fake hc that records what it sends and
 * a fake repro that files the output under $HOME/relics/<slug>.log.
 */
function runScript(steps, note = { claude: "t9", pipe: "repro --screen" }, fakeOpen = null) {
  const home = mkdtempSync(join(tmpdir(), "kit-run-"));
  if (fakeOpen) writeFileSync(join(home, "open"), fakeOpen, { mode: 0o755 });
  const log = join(home, "sent.log");
  writeFileSync(join(home, "hc"), `#!/bin/sh\nprintf '%s\\t%s\\t%s\\n' "$1" "$2" "$3" >> '${log}'\n`, { mode: 0o755 });
  // Options before the slug are recorded in relics/flags.
  writeFileSync(join(home, "repro"), `#!/bin/sh\nmkdir -p '${home}/relics'\nwhile [ "\${1#--}" != "$1" ]; do printf '%s\\n' "$1" >> '${home}/flags'; shift; done\ncat > '${home}/relics/'"$1".log\necho '${home}/relics/'"$1".log\n`, { mode: 0o755 });
  const script = runArgv(steps, home, note)[2];
  const r = spawnSync("zsh", ["-c", script], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, HOME: home, PATH: `${home}:${process.env.PATH}`, HC_TERMINAL_ID: "t42", TMPDIR: home } });
  const sent = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((l) => l.split("\t")) : [];
  const dir = join(home, ".config", "herdr-kit", "runstate");
  const states = {};
  if (existsSync(dir)) for (const f of readdirSync(dir)) states[f] = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const relics = existsSync(join(home, "relics")) ? Object.fromEntries(readdirSync(join(home, "relics")).map((f) => [f, readFileSync(join(home, "relics", f), "utf8")])) : {};
  const flags = existsSync(join(home, "flags")) ? readFileSync(join(home, "flags"), "utf8").trim().split("\n") : [];
  return { r, sent, states, home, relics, flags };
}

test("runArgv: one card writes its state and sends one finished note", { skip: !HAS_ZSH }, () => {
  const label = `say "hi" $HOME & 'quote'\nnext`;
  const { r, sent, states, home, relics, flags } = runScript([{ id: "k1", label, command: "echo out\necho oops >&2\nfalse" }]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(flags, ["--screen"], "repro replays the screen, so \\r progress keeps its last frame");
  assert.match(r.stdout, /out/);
  const name = "run-say-hi-home-quote-next.log";
  assert.deepEqual(Object.keys(relics), [name]);
  assert.match(relics[name], /out\r?\n[\s\S]*oops/, "stdout and stderr both land in the relic");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].slice(0, 2), ["send", "t9"]);
  assert.equal(sent[0][2], `${RUN_NOTE} finished: "say "hi" $HOME & 'quote' next" exited 1. Output: ${home}/relics/${name}`);
  assert.deepEqual(readdirSync(home).filter((f) => f.startsWith("kit-run.")), [], "the temp capture is removed");
  assert.deepEqual(Object.keys(states), ["t9-k1.json"]);
  assert.equal(states["t9-k1.json"].state, "done");
  assert.equal(states["t9-k1.json"].exit, 1);
  assert.equal(states["t9-k1.json"].terminal, "t42");
  assert.ok(Number.isInteger(states["t9-k1.json"].at));
  assert.equal(states["t9-k1.json"].log, `${home}/relics/${name}`, "the state file says where the log is");
  assert.ok(!r.stdout.includes(home + "/.config"), "state writes stay quiet");
});

test("runArgv: a sequence runs in order in one shell and stops at the first failure", { skip: !HAS_ZSH }, () => {
  const steps = [
    { id: "s1", label: "make dir", command: "mkdir -p sub && cd sub", step: 1, of: 3 },
    { id: "s2", label: "fail here", command: "echo in-$(basename $PWD)\nexit_with() { return $1 }\nexit_with 3", step: 2, of: 3 },
    { id: "s3", label: "never", command: "echo SHOULD-NOT-RUN", step: 3, of: 3 },
  ];
  const { r, sent, states, home, relics } = runScript(steps);
  assert.equal(r.status, 0, r.stderr);
  const out = relics["run-make-dir-all.log"];
  assert.match(out, /── step 1\/3 "make dir" ──/);
  assert.match(out, /in-sub/, "cd carries to the next step");
  assert.doesNotMatch(out, /SHOULD-NOT-RUN/);
  assert.deepEqual(
    Object.fromEntries(Object.entries(states).map(([k, v]) => [k, [v.state, v.exit]])),
    { "t9-s1.json": ["done", 0], "t9-s2.json": ["done", 3], "t9-s3.json": ["skipped", null] },
  );
  for (const f of ["t9-s1.json", "t9-s2.json", "t9-s3.json"]) assert.equal(states[f].log, `${home}/relics/run-make-dir-all.log`, f);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][2], `${RUN_NOTE} all finished: 1/3 "make dir" exit 0; 2/3 "fail here" exit 3; 3/3 "never" skipped. Output: ${home}/relics/run-make-dir-all.log`);
});

test("runArgv: a sequence that passes runs every step", { skip: !HAS_ZSH }, () => {
  const steps = [1, 2].map((n) => ({ id: `p${n}`, label: `p${n}`, command: `echo step-${n}`, step: n, of: 2 }));
  const { sent, states, relics } = runScript(steps);
  assert.match(relics["run-p1-all.log"], /step-1[\s\S]*step-2/);
  assert.equal(states["t9-p2.json"].exit, 0);
  assert.match(sent[0][2], /1\/2 "p1" exit 0; 2\/2 "p2" exit 0\. Output: /);
});

test("runArgv: no hc or repro on PATH still runs the command and keeps its output", { skip: !HAS_ZSH }, () => {
  const script = runArgv([{ id: "k", label: "x", command: "echo fine" }], null, { claude: "t9" })[2];
  const home = mkdtempSync(join(tmpdir(), "kit-nohc-"));
  const r = spawnSync("/bin/zsh", ["-fc", script], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { PATH: "/usr/bin:/bin", HOME: home } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /fine/);
  const dir = join(home, ".config", "herdr-kit", "runlogs");
  const logs = readdirSync(dir);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^\d{4}-\d\d-\d\d-\d{6}-run-x\.log$/);
  assert.match(readFileSync(join(dir, logs[0]), "utf8"), /fine/);
});

test("runSlug: a filename word from the label", () => {
  assert.equal(runSlug("Merge the harness PR #134!"), "run-merge-the-harness-pr-134");
  assert.equal(runSlug("…"), "run");
  assert.ok(runSlug("x".repeat(99)).length <= 44);
});

const herdr = (view, list) => {
  const calls = [], sets = [];
  return { calls, sets, panes: () => list, shared: (k) => (k === "kit.view" ? view : null), setShared: (k, v) => sets.push([k, v]), run: (...a) => calls.push(a) };
};

test("openRunLog: opens the log in less under the Claude's pane; nothing without a log or pane", () => {
  const list = [{ pane: "p1", terminal: "t1", cwd: "/w" }];
  const h = herdr("focus", list);
  assert.equal(openRunLog("t1", "/r/x.log", h), true);
  assert.deepEqual(h.calls, [
    ["agent.focus", { terminal: "t1" }],
    ["pane.split", { direction: "down", pane: "p1", argv: ["less", "-R", "/r/x.log"] }],
  ]);
  const g = herdr("grid", list);
  openRunLog("t1", "/r/x.log", g);
  assert.deepEqual(g.calls, [], "the grid asks herdr-signals, and splits nothing itself");
  assert.deepEqual(g.sets, [
    ["kit.afterView", { view: "focus", address: "t1", argv: ["less", "-R", "/r/x.log"] }],
    ["kit.viewWant", "focus"],
  ]);
  assert.equal(h.sets.length, 0);
  for (const [addr, log, l] of [["t1", null, list], ["t1", "/r/x.log", []]]) {
    const n = herdr("focus", l);
    assert.equal(openRunLog(addr, log, n), false);
    assert.deepEqual(n.calls, []);
  }
});

test("runCard: splits a terminal under the Claude's pane; the grid goes to the focus view first", () => {
  const list = [{ pane: "p1", terminal: "t1", cwd: "/w" }];
  const h = herdr("focus", list);
  const steps = [{ id: "k", label: "list", command: "ls" }];
  assert.equal(runCard("t1", steps, h), true);
  assert.deepEqual(h.calls, [
    ["agent.focus", { terminal: "t1" }],
    ["pane.split", { direction: "down", pane: "p1", argv: runArgv(steps, "/w", { claude: "t1" }) }],
  ]);
  const g = herdr("grid", list);
  runCard("t1", steps, g);
  assert.deepEqual(g.calls, []);
  assert.deepEqual(g.sets, [
    ["kit.afterView", { view: "focus", address: "t1", argv: runArgv(steps, "/w", { claude: "t1" }) }],
    ["kit.viewWant", "focus"],
  ]);
  assert.equal(h.sets.length, 0);
  const gone = herdr("focus", []);
  assert.equal(runCard("t1", steps, gone), false);
  assert.deepEqual(gone.calls, []);
});

test("copyCommand: copies, shows ✓ for 1.5 s", () => {
  const cx = fakeCx();
  let clip = null;
  cx.write_to_clipboard = (s) => { clip = s; };
  const view = { copied: null };
  copyCommand(view, "k", "ls -la", cx);
  assert.equal(clip, "ls -la");
  assert.equal(view.copied, "k");
  cx.advance(1499);
  assert.equal(view.copied, "k");
  cx.advance(2);
  assert.equal(view.copied, null);
});

// --- dismissing ---

test("dismissRun hides one card for one Claude; visibleRuns filters it", () => {
  const r1 = { label: "a", command: "ls" };
  const r2 = { label: "b", command: "pwd" };
  const agents = [{ address: "t1", runs: [r1, r2] }, { address: "t2", runs: [r1] }];
  const d = dismissRun(undefined, agents, "t1", r1);
  assert.deepEqual(visibleRuns(agents[0], d), [r2]);
  assert.deepEqual(visibleRuns(agents[1], d), [r1]);
  assert.deepEqual(visibleRuns(agents[0], null), [r1, r2]);
  assert.deepEqual(visibleRuns(undefined, d), []);
});

test("dismissRun drops keys for cards no Claude has any more", () => {
  const old = { label: "old", command: "ls" };
  const now = { label: "new", command: "pwd" };
  const d = dismissRun({ [runKey("t1", old)]: true, [runKey("gone", old)]: true }, [{ address: "t1", runs: [now] }], "t1", now);
  assert.deepEqual(Object.keys(d), [runKey("t1", now)]);
});

test("a card re-posted in a new message is visible again, and a numbered set keeps Run all", () => {
  const msg = (n, tag) => [
    `Step ${tag}.`, "", AI, "",
    ...[1, 2].flatMap((i) => [`**▶ Run ${i}/2:** prod deploy ${i}`, "", `${F}sh`, `make deploy${i}`, F, ""]),
  ].join("\n");
  const first = runCards(msg(1, "one"));
  const agent = (runs) => ({ address: "t1", runs });
  let d = dismissRun(undefined, [agent(first)], "t1", first[0]);
  d = dismissRun(d, [agent(first)], "t1", first[1]);
  assert.deepEqual(visibleRuns(agent(first), d), []);
  // Same message still shown: both stay hidden.
  assert.deepEqual(visibleRuns(agent(runCards(msg(1, "one"))), d), []);
  // A new message with identical label, command and step shows again.
  const again = runCards(msg(2, "two"));
  const shown = visibleRuns(agent(again), d);
  assert.deepEqual(shown, again);
  assert.equal(groupRuns(shown).length, 1);
  assert.equal(groupRuns(shown)[0].seq.length, 2);
  assert.notEqual(again[0].id, first[0].id);
});

test("mergeRuns does not double a card the same text posted under another message", () => {
  const a = { id: "a", label: "a", command: "x" };
  const a2 = { id: "z", label: "a", command: "x" };
  assert.deepEqual(mergeRuns([a], [a2]), [a]);
});

// --- the hook ---

function hookRig() {
  const home = mkdtempSync(join(tmpdir(), "kit-home-"));
  const transcript = join(home, "t.jsonl");
  writeFileSync(transcript, "");
  const file = join(home, ".config", "herdr-kit", "names", "term1.json");
  const hook = (input) => spawnSync("node", [NAME_HOOK], { input: JSON.stringify({ session_id: "s", transcript_path: transcript, ...input }), env: { ...process.env, HOME: home, HC_TERMINAL_ID: "term1" }, encoding: "utf8" });
  const say = (...recs) => writeFileSync(transcript, recs.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return { hook, read: () => JSON.parse(readFileSync(file, "utf8")), say };
}
const user = (text) => ({ type: "user", message: { role: "user", content: text } });
const said = (text) => ({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } });
const asks = () => ({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "AskUserQuestion", input: {} }] } });
const answer = () => ({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: "picked" }] } });
const two = `${AI}\n\n**▶ Run:** list\n\n${F}sh\nls\n${F}\n\n**▶ Run:** where\n\n${F}sh\npwd\n${F}`;

test("name hook: Stop writes runs, a real prompt clears them", () => {
  const { hook, read } = hookRig();
  assert.equal(hook({ hook_event_name: "Stop", last_assistant_message: two }).status, 0);
  const a = read();
  assert.equal(a.card, "run");
  assert.deepEqual(strip(a.runs), [{ label: "list", command: "ls" }, { label: "where", command: "pwd" }]);
  hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "x" } });
  assert.deepEqual(read().runs, a.runs);
  hook({ hook_event_name: "UserPromptSubmit", prompt: "what about the other thing?" });
  assert.deepEqual(read().runs, []);
  assert.equal(read().card, null);
});

test("name hook: a Run note keeps the cards; the reply adds new ones and drops none", () => {
  const { hook, read } = hookRig();
  hook({ hook_event_name: "Stop", last_assistant_message: two });
  const before = read().runs;
  hook({ hook_event_name: "UserPromptSubmit", prompt: `${RUN_NOTE} finished: "list" exited 0. Output: ~/.config/herdr-kit/runlogs/2026-11-08-run-list.log` });
  assert.deepEqual(read().runs, before);
  assert.equal(read().card, "run");
  hook({ hook_event_name: "Stop", last_assistant_message: "It worked: the listing looks right." });
  assert.deepEqual(read().runs, before, "a short reply keeps the list");
  assert.equal(read().card, "run");
  hook({ hook_event_name: "UserPromptSubmit", prompt: `${RUN_NOTE} finished: "where" exited 0 in terminal t6.` });
  hook({ hook_event_name: "Stop", last_assistant_message: `Good.\n\n${AI}\n\n**▶ Run:** next\n\n${F}sh\necho next\n${F}` });
  assert.deepEqual(read().runs.map((r) => r.label), ["list", "where", "next"]);
  // After the reply, a real prompt and Stop replace the list again.
  hook({ hook_event_name: "UserPromptSubmit", prompt: "ok, now something else" });
  hook({ hook_event_name: "Stop", last_assistant_message: "Done, nothing for you." });
  assert.deepEqual(read().runs, []);
});

test("name hook: Run cards before a selection menu show while it's up and stay after the answer", () => {
  const { hook, read, say } = hookRig();
  say(user("go"), said(two), asks());
  hook({ hook_event_name: "PreToolUse", tool_name: "AskUserQuestion", tool_input: {} });
  assert.deepEqual(read().runs.map((r) => r.label), ["list", "where"], "cards show while the menu is up");
  assert.equal(read().card, "decide");
  say(user("go"), said(two), asks(), answer(), said("Deploying now."));
  hook({ hook_event_name: "Stop", last_assistant_message: "Deploying now." });
  assert.deepEqual(read().runs.map((r) => r.label), ["list", "where"], "the answer doesn't drop them");
  assert.equal(read().card, "run");
  hook({ hook_event_name: "UserPromptSubmit", prompt: "thanks" });
  assert.deepEqual(read().runs, []);
});

test("name hook: a menu with no cards before it doesn't bring back last turn's", () => {
  const { hook, read, say } = hookRig();
  hook({ hook_event_name: "Stop", last_assistant_message: two });
  hook({ hook_event_name: "UserPromptSubmit", prompt: "next thing" });
  say(user("old"), said(two), user("next thing"), asks());
  hook({ hook_event_name: "PreToolUse", tool_name: "AskUserQuestion", tool_input: {} });
  assert.deepEqual(read().runs, []);
  assert.equal(read().card, "decide");
});

// --- quiet runs close themselves ---

test("isQuietCommand: cd, open and gh --web only", () => {
  for (const q of [
    "open docs/guide.md",
    "cd ~/code/score-board\nopen docs/FRONTEND_INTEGRATION_GUIDE.md",
    "# check the page\nopen https://example.com",
    "gh pr view 115 --web",
    "gh pr view 117 -w",
    "gh browse",
    "cd ~/x && open y.md",
    "gh issue view 9 \\\n  --web",
  ]) assert.equal(isQuietCommand(q), true, q);
  for (const loud of [
    "gh pr view 115",
    "gh pr merge 117 --merge",
    "npm test",
    "open x.md && npm test",
    "",
    "# just a comment",
    "open x.md | cat",
    "gh pr view 1 --web > out.txt",
    "opener x",
  ]) assert.equal(isQuietCommand(loud), false, loud);
});

test("runArgv: a quiet run that worked exits (closing the pane) and sends no note", { skip: !HAS_ZSH }, () => {
  const script = runArgv([{ id: "q1", label: "open it", command: "cd /tmp && open -R /tmp" }], null, { claude: "t9" })[2];
  assert.match(script, /\[ -z "\$__kit_failed" \] && \{ rm -rf "\$__kit_tmp"; exit 0; \}\n/);
  assert.doesNotMatch(runArgv([{ label: "t", command: "npm test" }], null)[2], /&& \{ rm/);
  // Run it with a fake open on PATH: it must exit before the note and the shell.
  const { r, sent, states, relics } = runScript([{ id: "q2", label: "open it", command: "open guide.md" }], { claude: "t9" }, "#!/bin/sh\necho opened \"$1\"\n");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /opened guide.md/);
  assert.deepEqual(relics, {}, "nothing worth keeping");
  assert.equal(sent.length, 0);
  assert.deepEqual([states["t9-q2.json"].state, states["t9-q2.json"].exit], ["done", 0]);
  assert.equal(states["t9-q2.json"].log, undefined, "no log, so none recorded");
});

test("runArgv: a quiet run that fails keeps its output and tells the Claude", { skip: !HAS_ZSH }, () => {
  const { sent, states, relics } = runScript([{ id: "q3", label: "open it", command: "open missing.md" }], { claude: "t9", pipe: "repro --screen" }, "#!/bin/sh\necho 'no such file' >&2\nexit 1\n");
  assert.match(relics["run-open-it.log"], /no such file/);
  assert.equal(sent.length, 1);
  assert.match(sent[0][2], /"open it" exited 1/);
  assert.equal(states["t9-q3.json"].exit, 1);
});

test("runKey: printable, per card, and survives a JSON round trip", () => {
  const a = { id: "k1", label: "a", command: "ls" };
  const b = { id: "k2", label: "a", command: "ls" };
  const c = { label: "no id", command: "pwd" };
  const d = { label: "no id", command: "whoami" };
  for (const r of [a, b, c, d]) assert.match(runKey("t1p", r), /^[\x21-\x7e]+$/);
  assert.equal(runKey("t1p", a), "t1p:k1");
  assert.equal(new Set([a, b, c, d].map((r) => runKey("t1p", r))).size, 4);
  const stored = JSON.parse(JSON.stringify(dismissRun({}, [{ address: "t1p", runs: [a, b] }], "t1p", a)));
  assert.deepEqual(visibleRuns({ address: "t1p", runs: [a, b] }, stored), [b]);
});

test("name hook: AskUserQuestion records the menu; the next tool clears it", () => {
  const { hook, read, say } = hookRig();
  say(user("go"), asks());
  hook({ hook_event_name: "PreToolUse", tool_name: "AskUserQuestion", tool_input: { questions: [{ header: "H", question: "Q?", multiSelect: false, options: [{ label: "A" }, { label: "B" }] }] } });
  assert.equal(read().menu.questions[0].question, "Q?");
  hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } });
  assert.equal(read().menu, null);
});
test("name hook: PermissionRequest records tool and detail; Stop clears it and stores the Ask text", () => {
  const { hook, read } = hookRig();
  hook({ hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "./deploy.sh prod" } });
  assert.deepEqual(read().perm, { tool: "Bash", detail: "./deploy.sh prod" });
  hook({ hook_event_name: "Stop", last_assistant_message: "Done.\n\n## Your action items\n\n**? Ask:** which box?" });
  assert.equal(read().perm, null);
  assert.equal(read().ask_text, "which box?");
  hook({ hook_event_name: "UserPromptSubmit", prompt: "box 2" });
  assert.equal(read().ask_text, null);
});

// --- the last-reply peek's Copy pill ---

/** Every call recorded in a stub element tree, flattened. */
const flat = (el) => (el?.calls ?? []).flatMap((c) => [c, ...c.slice(1).flatMap(flat)]);
const T = { foreground: "f", muted: "m", border: "b", hover: "h", dim: "d" };

test("replyBlock: a Copy pill beside the heading when there is a reply, nothing when not", () => {
  const { replyBlock } = look;
  assert.equal(replyBlock(T, "t1", [], null, () => {}), null);
  const calls = flat(replyBlock(T, "t1", ["a", "• b"], null, () => {}));
  assert.ok(calls.some((c) => c[0] === "id" && c[1] === "said-cp-t1"), "pill present");
  assert.ok(calls.some((c) => c[0] === "child" && c[1] === "Copy"));
  assert.ok(calls.some((c) => c[0] === "child" && c[1] === "✓ LAST REPLY"));
});

test("replyBlock: the pill reads ✓ Copied while this reply is the one copied", () => {
  const { replyBlock } = look;
  const labels = (copied) => flat(replyBlock(T, "t1", ["a"], copied, () => {})).filter((c) => c[0] === "child").map((c) => c[1]);
  assert.ok(labels("said-t1").includes("✓ Copied"));
  assert.ok(!labels("said-t1").includes("Copy"));
  assert.ok(labels("run-x").includes("Copy"), "another key's flash does not show here");
});

test("replyText joins the rows with newlines, bullets kept; copying flashes via copyCommand", () => {
  const { replyText } = look;
  const rows = ["First paragraph", "• one", "• two"];
  assert.equal(replyText(rows), "First paragraph\n• one\n• two");
  const cx = fakeCx();
  let clip = null;
  cx.write_to_clipboard = (s) => { clip = s; };
  const view = { copied: null };
  copyCommand(view, "said-t1", replyText(rows), cx);
  assert.equal(clip, "First paragraph\n• one\n• two");
  assert.equal(view.copied, "said-t1");
  cx.advance(1501);
  assert.equal(view.copied, null);
});

test("every runCard/openRunLog call in the kit mods passes setShared", async () => {
  const { readFileSync } = await import("node:fs");
  let seen = 0;
  for (const m of ["kit-rail", "kit-tabs", "kit-pane"]) {
    const src = readFileSync(new URL(`../herdr/mods/${m}/main.js`, import.meta.url), "utf8");
    for (const [call] of src.matchAll(/\b(?:runCard|openRunLog)\([^;\n]*\{[^}]*\}\)/g)) {
      seen++;
      assert.match(call, /\bsetShared\b/, `${m}: ${call}`);
    }
  }
  assert.equal(seen, 5);
});
