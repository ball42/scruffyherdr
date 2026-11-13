import { test } from "node:test";
import assert from "node:assert/strict";
import { TEXT_METHOD, parsePermission, permissionSteps, menuSteps, replySteps, nextToOpen, canAutoOpen, isRemote, sendAnswer, KEY_GAP_MS, CONFIRM_MS,
  TAIL_LINES, tailLines, dropEnter, blankAnswers, pickOption, promptKey, blockKind, canAnswer, permTool, kindLabel, freshPicks, staleShown } from "../herdr/mods/kit-rail/answer.js";

const PERM = ` Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and always allow access to /tmp/spike from this project
   3. Yes, and switch to auto mode · auto mode handles these prompts for you
   4. No

 Esc to cancel · Tab to amend`;

const opts = (...l) => l.map((label) => ({ label, description: "" }));
const q = (multi, n = 3) => ({ header: "h", question: "q?", multi, options: opts(...["a", "b", "c", "d"].slice(0, n)) });

test("TEXT_METHOD is paste", () => assert.equal(TEXT_METHOD, "paste"));

test("parsePermission reads the numbered options and finds No", () => {
  assert.deepEqual(parsePermission(PERM), { deny: 4, options: [
    { n: 1, label: "Yes" }, { n: 2, label: "Yes, and always allow access to /tmp/spike from this project" },
    { n: 3, label: "Yes, and switch to auto mode · auto mode handles these prompts for you" }, { n: 4, label: "No" } ] });
});

test("parsePermission uses the live (last) prompt, not stale scrollback", () => {
  const old = " Do you want to proceed?\n ❯ 1. Yes\n   2. Yes, always\n   3. No\n\n";
  assert.equal(parsePermission(old + PERM).deny, 4);
  assert.equal(parsePermission(old + PERM).options.length, 4);
});

test("parsePermission handles cursor on 3, digits in labels, blank after header", () => {
  const s = " Do you want to proceed?\n\n   1. Yes\n   2. Yes, allow v2.1.3 for 1.5 hours\n ❯ 3. Yes, and auto\n   4. No\n";
  assert.deepEqual(parsePermission(s), { deny: 4, options: [
    { n: 1, label: "Yes" }, { n: 2, label: "Yes, allow v2.1.3 for 1.5 hours" }, { n: 3, label: "Yes, and auto" }, { n: 4, label: "No" } ] });
});

test("parsePermission returns null for other dialogs", () => {
  assert.equal(parsePermission(" Quick safety check: Is this a project you created or one you trust?\n ❯ No, exit\n   Yes, I trust this folder"), null);
  assert.equal(parsePermission(""), null);
  assert.equal(parsePermission(" Do you want to proceed?\n ❯ 1. Yes\n   2. Always"), null);
  assert.equal(parsePermission(" Do you want to proceed?\n ❯ 1. Yes"), null);
});

test("permissionSteps: allow, plain deny, deny with a reason", () => {
  const p = parsePermission(PERM);
  assert.deepEqual(permissionSteps(p, { n: 1 }), [{ keys: ["1"] }]);
  assert.deepEqual(permissionSteps(p, { deny: "" }), [{ keys: ["4"] }]);
  assert.deepEqual(permissionSteps(p, { deny: "   " }), [{ keys: ["4"] }]);
  assert.deepEqual(permissionSteps(p, { deny: "use printf" }), [{ keys: ["down", "down", "down"] }, { keys: ["tab"] }, { text: "use printf" }]);
});

test("menuSteps returns null when answers don't fit the menu", () => {
  const m = { questions: [q(false), q(true)] };
  const ok = [{ picks: [1], other: "" }, { picks: [2], other: "" }];
  assert.notEqual(menuSteps(m, ok), null);
  assert.equal(menuSteps(m, ok.slice(0, 1)), null);
  assert.equal(menuSteps(m, [{ picks: [1, 2], other: "" }, ok[1]]), null);
  assert.equal(menuSteps(m, [{ picks: [], other: "" }, ok[1]]), null);
  assert.equal(menuSteps(m, [{ picks: [9], other: "" }, ok[1]]), null);
  assert.equal(menuSteps(m, [{ picks: [0], other: "" }, ok[1]]), null);
  assert.equal(menuSteps(m, [{ picks: [4], other: "" }, ok[1]]), null, "Other with empty text");
  assert.equal(menuSteps(m, [{ picks: [4], other: "  " }, ok[1]]), null, "Other with whitespace");
  assert.equal(menuSteps(m, [ok[0], { picks: [], other: "" }]), null, "multi needs a pick");
  assert.equal(menuSteps(m, [ok[0], { picks: [1, 1], other: "" }]), null, "duplicate picks");
});

test("menuSteps: two questions, single then multi with Other, then the review screen", () => {
  const m = { questions: [q(false), q(true)] };
  assert.deepEqual(menuSteps(m, [{ picks: [2], other: "" }, { picks: [1, 4], other: "my text" }]), [
    { keys: ["2"] },
    { keys: ["enter", "down", "down", "down"] },
    { text: "my text" },
    { keys: ["enter"] },
    { keys: ["down", "enter"] },
    { keys: ["1"] },
  ]);
});

test("menuSteps: single-select Other types text with no advance keys", () => {
  const m = { questions: [q(false), q(false, 2)] };
  assert.deepEqual(menuSteps(m, [{ picks: [4], other: "free" }, { picks: [1], other: "" }]), [
    { keys: ["down", "down", "down"] }, { text: "free" }, { keys: ["1"] }, { keys: ["1"] },
  ]);
});

test("menuSteps: non-last multi without Other uses numbers then right", () => {
  const m = { questions: [q(true), q(false)] };
  assert.deepEqual(menuSteps(m, [{ picks: [3, 1], other: "" }, { picks: [2], other: "" }]), [
    { keys: ["3", "1"] }, { keys: ["right"] }, { keys: ["2"] }, { keys: ["1"] },
  ]);
});

test("menuSteps: last-question multi without Other walks the rows", () => {
  const m = { questions: [q(false), q(true)] };
  assert.deepEqual(menuSteps(m, [{ picks: [1], other: "" }, { picks: [2, 3], other: "" }]), [
    { keys: ["1"] },
    { keys: ["down", "enter", "down", "enter", "down"] },
    { keys: ["down", "enter"] },
    { keys: ["1"] },
  ]);
});

test("menuSteps: non-last multi with Other walks the rows", () => {
  const m = { questions: [q(true, 2), q(false)] };
  assert.deepEqual(menuSteps(m, [{ picks: [3], other: "x y" }, { picks: [1], other: "" }]), [
    { keys: ["down", "down"] },
    { text: "x y" },
    { keys: ["enter"] },
    { keys: ["down", "enter"] },
    { keys: ["1"] },
    { keys: ["1"] },
  ]);
});

test("menuSteps: a one-question single-select menu skips review; a one-question multi-select still submits it", () => {
  assert.deepEqual(menuSteps({ questions: [q(false)] }, [{ picks: [2], other: "" }]), [{ keys: ["2"] }]);
  const last = menuSteps({ questions: [q(true, 2)] }, [{ picks: [1], other: "" }]);
  assert.deepEqual(last, [{ keys: ["enter", "down", "down"] }, { keys: ["down", "enter"] }, { keys: ["1"] }]);
});

test("literal words survive as one text step", () => {
  const t = "enter the 'tab' key — café";
  const p = parsePermission(PERM);
  assert.deepEqual(permissionSteps(p, { deny: t }).filter((s) => "text" in s), [{ text: t }]);
  const m = { questions: [q(false)] };
  assert.deepEqual(menuSteps(m, [{ picks: [4], other: t }]).filter((s) => "text" in s), [{ text: t }]);
  const mm = { questions: [q(true)] };
  assert.deepEqual(menuSteps(mm, [{ picks: [4], other: t }]).filter((s) => "text" in s), [{ text: t }]);
});

test("replySteps", () => {
  assert.deepEqual(replySteps("hi"), [{ reply: "hi" }]);
  assert.deepEqual(replySteps(""), []);
});

test("nextToOpen: blocked first, then done with a question; skips answered, snoozed, remote", () => {
  const ag = (address, kind, extra = {}) => ({ address, snoozed: false, ask_text: null, attention: { kind }, ...extra });
  const list = [ag("d1", "done", { ask_text: "q?" }), ag("b1", "blocked"), ag("b2", "blocked", { snoozed: true }), ag("vps/b3", "blocked"), ag("b4", "blocked")];
  assert.equal(nextToOpen(list, "x"), "b1");
  assert.equal(nextToOpen(list, "b1"), "b4");
  assert.equal(nextToOpen([ag("d0", "done"), ag("d1", "done", { ask_text: "q?" })], "x"), "d1");
  assert.equal(nextToOpen([ag("b1", "blocked")], "b1"), null);
});

test("canAutoOpen is false with a draft", () => {
  assert.equal(canAutoOpen(null), true);
  assert.equal(canAutoOpen({ draft: "" }), true);
  assert.equal(canAutoOpen({ draft: "half a rep" }), false);
});

test("isRemote", () => {
  assert.equal(isRemote("vps/b3"), true);
  assert.equal(isRemote("b3"), false);
});

// sendAnswer
const st = (state, msg = "m", kind = "blocked") => ({ status: { state, kind, msg } });
const SHOWN = { state: "blocked", kind: "blocked", msg: "m" };
function fakeH(gets, { failOn } = {}) {
  const calls = [], sleeps = [];
  let i = 0;
  return {
    calls, sleeps,
    hc: async (args) => {
      calls.push(args);
      if (args[0] === "get") {
        const g = gets[Math.min(i++, gets.length - 1)];
        return typeof g === "string" ? { code: 0, stdout: g } : g.code !== undefined ? g : { code: 0, stdout: JSON.stringify(g) };
      }
      if (failOn && failOn(args)) return { code: 1, stdout: "" };
      return { code: 0, stdout: "" };
    },
    sleep: async (ms) => { sleeps.push(ms); },
  };
}
const GET = ["get", "w:1", "--json"];
const STEPS = [{ keys: ["down", "tab"] }, { text: "why" }, { reply: "hi" }];

test("sendAnswer: constants", () => { assert.equal(KEY_GAP_MS, 120); assert.equal(CONFIRM_MS, 8000); });

test("sendAnswer: a changed prompt sends nothing", async () => {
  for (const changed of [st("blocked", "other"), st("working"), st("blocked", "m", "x")]) {
    const h = fakeH([changed]);
    assert.equal(await sendAnswer("w:1", STEPS, SHOWN, h), "moved");
    assert.deepEqual(h.calls, [GET]);
    assert.deepEqual(h.sleeps, []);
  }
});

test("sendAnswer: unparseable or failing first get is failed", async () => {
  for (const bad of ["not json", { code: 1, stdout: "" }]) {
    const h = fakeH([bad]);
    assert.equal(await sendAnswer("w:1", STEPS, SHOWN, h), "failed");
    assert.deepEqual(h.calls, [GET]);
  }
});

test("sendAnswer: sends the steps in order and confirms", async () => {
  const h = fakeH([st("blocked"), st("blocked"), st("working")]);
  assert.equal(await sendAnswer("w:1", STEPS, SHOWN, h), "sent");
  assert.deepEqual(h.calls, [GET,
    ["keys", "w:1", "down", "tab"], ["send", "--force", "w:1", "why"], ["send", "w:1", "hi"],
    GET, GET]);
  assert.deepEqual(h.sleeps, [120, 120, 400, 400]);
});

test("sendAnswer: still on the same prompt after 8 s is stuck", async () => {
  const h = fakeH([st("blocked")]);
  assert.equal(await sendAnswer("w:1", [{ keys: ["1"] }], SHOWN, h), "stuck");
  assert.equal(h.calls.filter((c) => c[0] === "get").length, 1 + 20);
  assert.deepEqual(h.sleeps, Array(20).fill(400));
});

test("sendAnswer: a failed poll counts as same and polling continues", async () => {
  const h = fakeH([st("blocked"), "garbage", { code: 1, stdout: "" }, st("blocked", "next")]);
  assert.equal(await sendAnswer("w:1", [{ keys: ["1"] }], SHOWN, h), "sent");
  assert.deepEqual(h.sleeps, [400, 400, 400]);
});

test("sendAnswer: a failing hc stops and reports failed", async () => {
  const h = fakeH([st("blocked")], { failOn: (a) => a[0] === "send" && a[1] === "--force" });
  assert.equal(await sendAnswer("w:1", STEPS, SHOWN, h), "failed");
  assert.deepEqual(h.calls, [GET, ["keys", "w:1", "down", "tab"], ["send", "--force", "w:1", "why"]]);
  assert.deepEqual(h.sleeps, [120]);
});

test("sendAnswer: a reply to a done Claude passes the check", async () => {
  const shown = { state: "done", kind: "done", msg: "all set" };
  const h = fakeH([st("done", "all set", "done"), st("done", "all set", "done"), st("working", "all set", "done")]);
  assert.equal(await sendAnswer("w:1", [{ reply: "next" }], shown, h), "sent");
  assert.deepEqual(h.calls, [GET, ["send", "w:1", "next"], GET, GET]);
  assert.deepEqual(h.sleeps, [400, 400]);
});

test("sendAnswer: never sends esc", async () => {
  const h = fakeH([st("blocked")]);
  assert.equal(await sendAnswer("w:1", [{ keys: ["1"] }, { keys: ["down", "esc"] }], SHOWN, h), "failed");
  assert.ok(h.calls.every((c) => c[0] === "get"));
  assert.deepEqual(h.sleeps, []);
});

test("sendAnswer: no steps is failed with no calls", async () => {
  const h = fakeH([st("blocked")]);
  assert.equal(await sendAnswer("w:1", [], SHOWN, h), "failed");
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.sleeps, []);
});

// ---- the expanded card's view helpers ----

test("tailLines keeps the last 15 non-empty lines, right-trimmed", () => {
  assert.equal(TAIL_LINES, 15);
  const screen = Array.from({ length: 30 }, (_, i) => (i % 2 ? "   " : `  line ${i}  `)).join("\n");
  const t = tailLines(screen);
  assert.equal(t.length, 15);
  assert.equal(t[14], "  line 28");
  assert.equal(t[0], "  line 0");
  assert.deepEqual(tailLines("a\n\nb\n", 1), ["b"]);
  assert.deepEqual(tailLines(null), []);
});

test("dropEnter takes back the newline a plain Enter typed", () => {
  assert.equal(dropEnter("hello", "hello\n"), "hello");
  assert.equal(dropEnter("ab", "a\nb"), "ab");
  assert.equal(dropEnter("hell", "hello"), "hello");
  assert.equal(dropEnter("a\n", "a\n\n"), "a\n");
  assert.equal(dropEnter("", "\n"), "");
  assert.equal(dropEnter("abc", "abc"), "abc");
  assert.equal(dropEnter("ab", "xab"), "xab");
});

test("pickOption: single replaces, multi toggles, out of range ignored", () => {
  const m = { questions: [q(false), q(true)] };
  let a = blankAnswers(m);
  assert.deepEqual(a, [{ picks: [], other: "" }, { picks: [], other: "" }]);
  a = pickOption(a, m, 0, 2);
  a = pickOption(a, m, 0, 3);
  assert.deepEqual(a[0].picks, [3]);
  a = pickOption(a, m, 1, 3);
  a = pickOption(a, m, 1, 1);
  assert.deepEqual(a[1].picks, [1, 3]);
  a = pickOption(a, m, 1, 3);
  assert.deepEqual(a[1].picks, [1]);
  assert.equal(pickOption(a, m, 1, 5), a);
  assert.equal(pickOption(a, m, 2, 1), a);
  assert.deepEqual(pickOption(a, m, 0, 4)[0].picks, [4], "Other is options + 1");
  assert.deepEqual(blankAnswers(null), []);
});

test("promptKey: done and idle are one prompt; a new menu or a status change is another", () => {
  const b = { status: "blocked", ask: "Bash: x", menu: null, perm: { tool: "Bash", detail: "x" } };
  assert.equal(promptKey(b), promptKey({ ...b }));
  assert.notEqual(promptKey(b), promptKey({ ...b, perm: { tool: "Bash", detail: "y" } }));
  assert.notEqual(promptKey(b), promptKey({ ...b, status: "working" }));
  assert.equal(promptKey({ status: "done", ask_text: "Q?" }), promptKey({ status: "idle", ask_text: "Q?" }));
  assert.notEqual(promptKey({ status: "done", ask_text: "Q?" }), promptKey({ status: "done", ask_text: "R?" }));
});

test("blockKind and canAnswer", () => {
  const m = { questions: [q(false)] };
  assert.equal(blockKind({ status: "blocked", menu: m }, null), "menu");
  assert.equal(blockKind({ status: "blocked", perm: { tool: "Bash" } }, null), "permission");
  assert.equal(blockKind({ status: "blocked" }, { kind: "permission" }), "permission");
  assert.equal(blockKind({ status: "blocked" }, { kind: "question" }), "menu");
  assert.equal(blockKind({ status: "blocked" }, null), null);
  assert.equal(blockKind({ status: "done", ask_text: "Q?" }, null), "reply");
  assert.equal(blockKind({ status: "idle", ask_text: "Q?" }, null), "reply");
  assert.equal(blockKind({ status: "done" }, null), null);
  assert.equal(blockKind({ status: "working", ask_text: "Q?" }, null), null);
  const perm = { options: [], deny: 2 };
  assert.equal(canAnswer("permission", { address: "t1" }, perm), true);
  assert.equal(canAnswer("permission", { address: "t1" }, null), false, "unparsed fails closed");
  assert.equal(canAnswer("permission", { address: "vps/t1" }, perm), false, "remote");
  assert.equal(canAnswer("menu", { address: "t1", menu: null }, null), false, "no hook data");
  assert.equal(canAnswer("menu", { address: "t1", menu: m }, null), true);
  assert.equal(canAnswer("reply", { address: "t1", ask_text: "Q?" }, null), true);
  assert.equal(canAnswer(null, { address: "t1" }, perm), false);
});

test("kindLabel and permTool", () => {
  assert.equal(kindLabel("permission", { perm: { tool: "Bash" } }, null), "✋ PERMISSION · Bash");
  assert.equal(permTool({}, { msg: "approve Edit: src/a.js" }), "Edit");
  assert.equal(kindLabel("permission", {}, null), "✋ PERMISSION");
  assert.equal(kindLabel("menu", { menu: { questions: [q(false), q(true)] } }, null), "◆ DECISION · 2 questions");
  assert.equal(kindLabel("menu", { menu: { questions: [q(false)] } }, null), "◆ DECISION · 1 question");
  assert.equal(kindLabel("menu", {}, null), "◆ DECISION");
  assert.equal(kindLabel("reply", {}, null), "? QUESTION");
  assert.equal(kindLabel(null, {}, null), null);
});

test("freshPicks: no picks, first question, no Deny box", () => {
  assert.deepEqual(freshPicks({ questions: [q(false), q(true)] }), { answers: [{ picks: [], other: "" }, { picks: [], other: "" }], q: 0, permPick: null, denyOpen: false });
  assert.deepEqual(freshPicks(null).answers, []);
});

test("staleShown: a status change asks for one read, once", () => {
  const shown = { state: "done", kind: undefined, msg: "m" };
  assert.equal(staleShown("idle", shown, null), true);
  assert.equal(staleShown("idle", shown, "idle"), false, "already asked");
  assert.equal(staleShown("done", shown, null), false);
  assert.equal(staleShown("idle", null, null), false, "nothing read yet");
});
