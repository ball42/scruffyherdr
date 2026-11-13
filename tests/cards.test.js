import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CARD_SPEC, lintMessage, cardKind, isDecision, lastAssistantText, menuFromInput, askText } from "../claude/cards.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARD_HOOK = join(ROOT, "claude", "card-hook.mjs");
// The public cut ships cards.js (the name hook reads it) but not the card hook yet.
const NO_CARD_HOOK = !existsSync(CARD_HOOK);
const NAME_HOOK = join(ROOT, "claude", "name-hook.mjs");
const F = "```";

test("CARD_SPEC shows all three cards", () => {
  for (const s of ["**▶ Run:**", "**Expect:**", "AskUserQuestion", "**? Ask:**"]) assert.ok(CARD_SPEC.includes(s), s);
});

// --- lintMessage: flagged ---

const AI = "## Your action items";
const NEEDS_SECTION = "end with a ## Your action items section and put each ask in it as a card";

test("check 1: a closing option list after a question or option wording", () => {
  const want = ["use AskUserQuestion for options instead of a list in prose"];
  assert.deepEqual(lintMessage("Which approach do you want?\n\n1. Cache it\n2. Skip it"), want);
  assert.deepEqual(lintMessage("I see two options:\n- cache it\n- skip it"), want);
  assert.deepEqual(lintMessage("Done. I'd prefer one of these:\n\n* a\n* b\n  more on b"), want);
  assert.deepEqual(lintMessage("Should I go ahead\nwith the rename?\n- yes\n- no"), want);
});

test("check 2: inside the action items, every item is a card", () => {
  assert.deepEqual(lintMessage(`${AI}\n- Check the Now playing row at https://x`), [
    "write each action item as a card (**▶ Run:** or **? Ask:**), not a list item",
  ]);
  assert.deepEqual(lintMessage(`${AI}\n\n${F}sh\nnpm test\n${F}`), ["start each command block in Your action items with a **▶ Run:** line"]);
  assert.deepEqual(lintMessage(`${AI}\n\nWhich box should it read from?`), ["start each question in Your action items with **? Ask:**"]);
  assert.deepEqual(lintMessage(`${AI}\n\n**? Ask:** which box? and when?`), ["one question per **? Ask:** card"]);
  assert.deepEqual(lintMessage(`**Your action items**\n1. merge it`), ["write each action item as a card (**▶ Run:** or **? Ask:**), not a list item"]);
});

test("check 3: a card or a closing ask with no action items section", () => {
  assert.deepEqual(lintMessage("Fixed.\n\nWhat should the key show?"), [NEEDS_SECTION]);
  assert.deepEqual(lintMessage("Fixed.\n\n**? Ask:** which name?"), [NEEDS_SECTION]);
  assert.deepEqual(lintMessage(`Try:\n\n${F}sh\nnpm test\n${F}`), [NEEDS_SECTION]);
  assert.deepEqual(lintMessage(`**▶ Run:** build\n\n${F}sh\nnpm run build\n${F}\n\nThen I'll check it.`), [NEEDS_SECTION]);
});

test("check 5: a question that can be answered by picking is a decision", () => {
  const DECIDE = "that question is a decision: ask it with AskUserQuestion (batch up to 4 questions in one call, recommended option first), not as text";
  // the real Ask cards from 2026-11-06 that should have been pickers
  for (const q of [
    "should I run `scripts/deploy.sh prod` from a fresh worktree now?",
    "is the design approved, or what should change?",
    "should the watcher get its own project space now, or wait until it has users?",
    "today free users get one cycle. Is that the free tier you want, or should free users get more?",
    "approve the design in ops-hub #60 as written, or tell me what to change?",
    "should I start the widget? Your only part afterwards is one build on your phone.",
  ]) assert.deepEqual(lintMessage(`${AI}\n\n**? Ask:** ${q}`), [DECIDE], q);
  assert.deepEqual(lintMessage(`${AI}\n\nWant me to merge it?`), [DECIDE]);
  assert.deepEqual(lintMessage("Fixed. Want me to also update the README?"), [DECIDE]);
  assert.deepEqual(lintMessage("Done.\n\nShould I deploy now?"), [DECIDE]);
  // in the middle of a message, and behind a bold lead-in
  assert.deepEqual(lintMessage("Want me to file it as an issue?\n\nThe tests pass."), [DECIDE]);
  assert.deepEqual(lintMessage("**Termination protection:** should I turn it on now?\n\nEverything else is done."), [DECIDE]);
  assert.deepEqual(lintMessage(`Shall I merge it?\n\n## Your action items\n\n**? Ask:** which name?`), [DECIDE]);
  // quoted, it is an example
  assert.deepEqual(lintMessage('It flags "should I deploy now?" as a decision.\n\nThe tests pass.'), []);
});

test("clean: open questions stay Ask cards", () => {
  for (const q of [
    "how should cycle numbering work for the Monolith, so #88 can come off the parked list?",
    "which box should the record book read from?",
    "what name or label should the key show?",
  ]) assert.deepEqual(lintMessage(`${AI}\n\n**? Ask:** ${q}`), [], q);
  assert.equal(isDecision("I asked whether we should deploy. It's done."), false);
});

test("check 6: an offer of more work hidden in a sentence", () => {
  const OFFER = "a sentence offers more work: ask it as a decision in AskUserQuestion, or drop it";
  for (const m of [
    "One cause I haven't checked: auto mode. If menus are still rare after the restart, that's the next thing I'd look at.",
    "Done. I can also add a test for the empty case.",
    "Merged. If you want, I'll clean up the old branches too.",
    "Fixed. Let me know if you'd like the README updated.",
    "All green. Happy to dig into the flaky test next.",
  ]) assert.deepEqual(lintMessage(m), [OFFER], m);
});

test("check 6: offer forms seen in real transcripts (2026-11-06)", () => {
  const OFFER = "a sentence offers more work: ask it as a decision in AskUserQuestion, or drop it";
  for (const m of [
    "I left it out, since it can get in the way of merging from your phone; I can add it if you want.",
    "I can take on the backups next if you like.",
    "Say the word and I'll do the AWS cleanup.",
    "If you'd like me to do the commit, push, and deploy myself, like last session, just say so.",
    "I can build it in a worktree whenever you say go.",
    "I can file it as a ticket.",
    "Meanwhile I can write Plan 6, the last plan in the redesign.",
    "That fits the CI ticket; I'll add it there as a note unless you want it fixed now.",
    "That's the next hardening step I'd recommend, and it would be one more PR.",
    "A possible follow-up: switching the Lambdas to ARM would make image builds native.",
    "Worth a separate ticket.",
    "Close the tickets: run step 5, or tell me to run it.",
    "Say so now if you'd rather review the dry-run list first.",
    "If you'd rather skip questions and have me just run it, say so.",
  ]) assert.deepEqual(lintMessage(`${m}\n\nThe tests pass.`), [OFFER], m);
});

test("clean: not offers", () => {
  for (const m of [
    "Merged. Let me know if anything breaks.",
    'All 8 were real hidden offers, such as "Tell me if you want it posted".',
    "The phrase “I can also add a test” is what it catches.",
    "It matches `if you want, I'll` style sentences.",
    "I can't reproduce it on main.",
    "If you want the old layout back, run install with --uninstall.",
    "Running all checks plus the snapshots, so I can look at the dashboard myself.",
    "That finishes every deploy I can do; what's left needs you.",
    "Tell me which box the record book reads from.",
    "If you'd rather go through a GitHub release, create a new tag.",
    "I'd recommend the native approach for this.",
    `Done.\n\n## Your action items\n\n**▶ Run:** check it\n\n${F}sh\nopen https://x\n${F}`,
  ]) assert.deepEqual(lintMessage(m), [], m);
});

test("command fences: arrows, prompts and trailing comments", () => {
  const run = (body, lang = "sh") => `${AI}\n\n**▶ Run:** x\n\n${F}${lang}\n${body}\n${F}`;
  assert.deepEqual(lintMessage(run("npm ci → npm test")), ["no → in a command block"]);
  assert.deepEqual(lintMessage(run("ls → ok", "")), ["no → in a command block"]);
  assert.deepEqual(lintMessage(run("$ npm test", "bash")), ["no `$ ` prompt prefix in a command block"]);
  assert.deepEqual(lintMessage(run("npm test # run it", "zsh")), ["put a # comment on its own line above the command, not after it"]);
  assert.equal(lintMessage(run("$ a → b # c", "console")).length, 3);
});

test("command fences: a line too long to copy from a narrow pane", () => {
  const run = (body) => `${AI}\n\n**▶ Run:** x\n\n${F}sh\n${body}\n${F}`;
  const long = "ssh -t me@host.local 'cd ~/code/some-long-project-name && git fetch --tags origin && scripts/testflight-archive.sh testflight/b56'";
  const [reason] = lintMessage(run(long));
  assert.match(reason, /60 characters or fewer/);
  assert.match(lintMessage(run(`# ${"x".repeat(60)}\nls`))[0], /60 characters/);
  const split = [
    "ssh -t me@host.local \\",
    "  'cd ~/code/some-long-project-name \\",
    "  && git fetch --tags origin \\",
    "  && scripts/testflight-archive.sh testflight/b56'",
  ].join("\n");
  assert.deepEqual(lintMessage(run(split)), []);
  assert.deepEqual(lintMessage(run("é".repeat(60))), []);
  // code shown to explain something is left alone
  assert.deepEqual(lintMessage(`The query:\n\n${F}sql\n${"select x ".repeat(10)}\n${F}\n\nThat's it.`), []);
});

test("check 4: an inline command to run, no fenced block", () => {
  const want = ["put the command in a Run card (a fenced block), not inline"];
  assert.deepEqual(lintMessage("Please run `npm test` and tell me what happens."), want);
  assert.deepEqual(lintMessage("You'll need to run `./install.sh` again."), want);
  assert.deepEqual(lintMessage("Done.\n\nRun `npm test` to check."), want);
  assert.deepEqual(lintMessage("You can run the tests with `npm test`."), want);
});

// --- lintMessage: clean ---

test("clean: prose, no asks, and full action items", () => {
  assert.deepEqual(lintMessage("I fixed the bug in `grid.js`. Tests pass."), []);
  assert.deepEqual(lintMessage(""), []);
  assert.deepEqual(lintMessage(undefined), []);
  const msg =
    `Done.\n\n${AI}\n\n**▶ Run:** rebuild\n\n${F}sh\n# build\nnpm --prefix site run build\nnpm test\n${F}\n\n` +
    `**Expect:** no errors\n\n**▶ Run:** check the page\n\n${F}sh\nopen https://x.dev/a?b=1\n${F}\n\n**? Ask:** what label should it show?`;
  assert.deepEqual(lintMessage(msg), []);
  assert.deepEqual(lintMessage(`${AI}\n\n**▶ Run:** press the reset button on the deck`), []);
  assert.deepEqual(lintMessage(`${AI}\nNone new. These are the four from before.`), []);
});

test("clean: # lines on their own, # inside quotes or $#, non-shell fences", () => {
  assert.deepEqual(lintMessage(`${AI}\n\n**▶ Run:** x\n\n${F}sh\n# one\ngit commit -m "fix #3"\necho $# 'a # b'\n  # indented\n${F}`), []);
  assert.deepEqual(lintMessage(`${F}js\nconst a = b → c; // $ x # y\n${F}`), []);
  assert.deepEqual(lintMessage(`${F}diff\n- a\n+ b # c\n${F}`), []);
});

test("clean: shell fences that explain rather than ask the user to run", () => {
  assert.deepEqual(lintMessage(`I ran:\n\n${F}sh\nnpm test # all of it\n${F}\n\nEverything passes.`), []);
  assert.deepEqual(lintMessage(`The flow:\n\n${F}\nhook → names file → mod\n${F}`), []);
  assert.deepEqual(lintMessage(`${F}sh\n$ a\n${F}\n\n${AI}\n\n**▶ Run:** this\n\n${F}sh\nnpm test\n${F}`), []);
});

test("clean: code blocks that explain, and text in fences is ignored", () => {
  const msg = `The function looks like this:\n\n${F}js\nfunction f() { return 1; } // why? how?\n${F}\n\nThat is the whole change.`;
  assert.deepEqual(lintMessage(msg), []);
  assert.deepEqual(lintMessage(`Output:\n${F}json\n{"a": "Run \`x\`?"}\n${F}`), []);
  assert.deepEqual(lintMessage(`Which?\n${F}js\n- a\n- b\n${F}`), []);
});

test("clean: a list that is not options, or not at the end", () => {
  assert.deepEqual(lintMessage("Changes made:\n\n- renamed `a` to `b`\n- added a test"), []);
  assert.deepEqual(lintMessage("Files which changed:\n- a.js\n- b.js"), []);
  assert.deepEqual(lintMessage("Which approach? I chose cache.\n\n- a\n- b\n\nAll done."), []);
});

test("clean: the assistant running something itself is not an instruction", () => {
  assert.deepEqual(lintMessage("I ran `npm test` and it passed. I'll run `npm ci` next."), []);
});

// --- cardKind ---

test("cardKind: action items, run wins over ask", () => {
  assert.equal(cardKind(`${AI}\n\n**▶ Run:** x\n\n${F}sh\nls\n${F}\n\n**? Ask:** y?`), "run");
  assert.equal(cardKind(`${AI}\n\n**▶ Run:** press the button`), "run");
  assert.equal(cardKind(`${AI}\n\n**? Ask:** which box?`), "ask");
  assert.equal(cardKind(`${AI}\nNone new.`), null);
});

test("cardKind: run", () => {
  assert.equal(cardKind(`**▶ Run:** build\n\n${F}sh\nnpm run build\n${F}`), "run");
  assert.equal(cardKind(`**▶ Run:** build\n\n${F}sh\nnpm run build\n${F}\n\n**Expect:** ok`), "run");
  assert.equal(cardKind(`Try this:\n\n${F}sh\nnpm test\n${F}\n`), "run");
  // untagged and unlabelled: could be a diagram or output, not a command
  assert.equal(cardKind(`Flow:\n\n${F}\nhook → mod\n${F}\n`), null);
  assert.equal(cardKind(`**▶ Run:** x\n${F}python\nprint(1)\n${F}`), "run");
});

test("cardKind: ask", () => {
  assert.equal(cardKind("Done.\n\n**? Ask:** which name?"), "ask");
  assert.equal(cardKind("Done.\n\nWant me to continue?"), "ask");
  assert.equal(cardKind("**? Ask:** name?\n"), "ask");
});

test("cardKind: null", () => {
  assert.equal(cardKind("All done."), null);
  assert.equal(cardKind(""), null);
  assert.equal(cardKind(`${F}js\nx\n${F}\n\nThat is it.`), null);
  assert.equal(cardKind(`${F}js\nx = 1\n${F}`), null);
  assert.equal(cardKind("Pick:\n\n- a?\n- b"), null);
  assert.equal(cardKind(`${F}sh\nls\n${F}\n\nthen more prose after`), null);
});

test("lastAssistantText takes the last assistant record with text", () => {
  const rec = (role, content) => JSON.stringify({ type: role, message: { role, content } });
  const t = [
    rec("assistant", [{ type: "text", text: "first" }]),
    rec("user", "hi"),
    rec("assistant", [{ type: "text", text: "second" }, { type: "tool_use", name: "x" }]),
    rec("assistant", [{ type: "tool_use", name: "y" }]),
    "junk",
  ].join("\n");
  assert.equal(lastAssistantText(t), "second");
  assert.equal(lastAssistantText(""), "");
});

// --- card-hook stdin -> stdout ---

const hook = (input, raw) =>
  spawnSync(process.execPath, [CARD_HOOK], { input: raw ?? JSON.stringify(input), env: { PATH: process.env.PATH } });

test("card-hook SessionStart prints the spec", { skip: NO_CARD_HOOK }, () => {
  const r = hook({ hook_event_name: "SessionStart" });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout.toString());
  assert.deepEqual(out, { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: CARD_SPEC } });
});

test("card-hook Stop blocks a bad message, passes a good one", { skip: NO_CARD_HOOK }, () => {
  const r = hook({ hook_event_name: "Stop", last_assistant_message: "Pick one?\n\n1. a\n2. b" });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout.toString());
  assert.equal(out.decision, "block");
  assert.equal(out.reason, "Card format: use AskUserQuestion for options instead of a list in prose — rewrite your last message to fix this.");
  const ok = hook({ hook_event_name: "Stop", last_assistant_message: "All done." });
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout.toString(), "");
});

test("card-hook Stop reads the transcript when there is no last_assistant_message", { skip: NO_CARD_HOOK }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ch-"));
  const tp = join(dir, "t.jsonl");
  const bad = JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Please run `npm test`." }] } });
  writeFileSync(tp, bad + "\n");
  const r = hook({ hook_event_name: "Stop", transcript_path: tp });
  assert.equal(JSON.parse(r.stdout.toString()).decision, "block");
});

test("card-hook is silent when stop_hook_active, and exits 0 on bad input", { skip: NO_CARD_HOOK }, () => {
  const bad = "Pick one?\n\n1. a\n2. b";
  const r = hook({ hook_event_name: "Stop", stop_hook_active: true, last_assistant_message: bad });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.toString(), "");
  for (const raw of ["{", "", "null", '{"hook_event_name":"Stop","transcript_path":"/nope"}', '{"hook_event_name":"PreToolUse"}']) {
    const x = hook(null, raw);
    assert.equal(x.status, 0, raw);
    assert.equal(x.stdout.toString(), "", raw);
  }
});

// --- name-hook card field ---

function nameSetup(lines = []) {
  const home = mkdtempSync(join(tmpdir(), "nh-"));
  const transcript = join(home, "t.jsonl");
  writeFileSync(transcript, lines.join("\n") + "\n");
  const run = (event, extra = {}, session = "s1") =>
    spawnSync(process.execPath, [NAME_HOOK], {
      input: JSON.stringify({ hook_event_name: event, session_id: session, transcript_path: transcript, ...extra }),
      env: { PATH: process.env.PATH, HOME: home, HC_TERMINAL_ID: "t1" },
    });
  const read = () => JSON.parse(readFileSync(join(home, ".config", "herdr-kit", "names", "t1.json"), "utf8"));
  return { run, read };
}

test("name-hook card: decide, then Stop sets the kind, a prompt clears it", () => {
  const h = nameSetup();
  h.run("SessionStart");
  assert.equal(h.read().card, null);
  h.run("PreToolUse", { tool_name: "AskUserQuestion", tool_input: {} });
  assert.equal(h.read().card, "decide");
  h.run("PreToolUse", { tool_name: "Bash", tool_input: { command: "ls" } });
  assert.equal(h.read().card, "decide");
  h.run("Stop", { last_assistant_message: `**▶ Run:** x\n\n${F}sh\nls\n${F}` });
  assert.equal(h.read().card, "run");
  h.run("PermissionRequest", { tool_name: "Bash", tool_input: { command: "ls" } });
  assert.equal(h.read().card, "run");
  h.run("PermissionRequest", { tool_name: "AskUserQuestion", tool_input: {} });
  assert.equal(h.read().card, "decide");
  h.run("UserPromptSubmit");
  assert.equal(h.read().card, null);
  h.run("Stop", { last_assistant_message: "Done. Anything else?" });
  assert.equal(h.read().card, "ask");
  h.run("Notification", {}, "s2");
  assert.equal(h.read().card, null);
});

test("name-hook card: Stop falls back to the transcript", () => {
  const msg = JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Which name?" }] } });
  const h = nameSetup([msg]);
  h.run("Stop");
  assert.equal(h.read().card, "ask");
});

test("menuFromInput keeps questions, options and multiSelect", () => {
  const m = menuFromInput({ questions: [
    { header: "Color", question: "Pick a color?", multiSelect: false, options: [{ label: "Red", description: "r" }, { label: "Blue", description: "b" }] },
    { header: "Pets", question: "Pick pets?", multiSelect: true, options: [{ label: "Cat" }] },
  ] });
  assert.deepEqual(m.questions.map((q) => [q.header, q.multi, q.options.map((o) => o.label)]), [["Color", false, ["Red", "Blue"]], ["Pets", true, ["Cat"]]]);
  assert.equal(m.questions[1].options[0].description, "");
});
test("menuFromInput: junk is null", () => {
  for (const bad of [null, {}, { questions: [] }, { questions: [{ question: "" }] }]) assert.equal(menuFromInput(bad), null);
});
test("askText takes the Ask card, else a closing question", () => {
  assert.equal(askText("Done.\n\n## Your action items\n\n**? Ask:** which box should it read from?"), "which box should it read from?");
  assert.equal(askText("All set.\n\nShould the b58 pass run on the iPhone first?"), "Should the b58 pass run on the iPhone first?");
  assert.equal(askText("All set, nothing for you."), null);
});
