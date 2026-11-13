#!/usr/bin/env node
// Claude Code hook: tells the kit's rail this session's name.
// Writes ~/.config/herdr-kit/names/<HC_TERMINAL_ID>.json, where Herdr's
// herdr-signals mod reads it. Outside Herdr (no HC_TERMINAL_ID) it does
// nothing. It never fails the hook: every path exits 0.
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gitBranch } from "./git.js";
import { askCards, askText, cardKind, isRunNote, lastAssistantText, lastSaid, menuFromInput, mergeRuns, runCards, turnText } from "./cards.js";
import { latestTitles, summarizeAsk, summarizeTool } from "./titles.js";

const TAIL_BYTES = 512 * 1024;

function readTail(path) {
  const size = statSync(path).size;
  const start = Math.max(0, size - TAIL_BYTES);
  const buf = Buffer.alloc(size - start);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buf, 0, buf.length, start);
  } finally {
    closeSync(fd);
  }
  return buf.toString("utf8");
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

function cleanStale(dir, keep) {
  for (const f of readdirSync(dir)) {
    if (f === keep) continue;
    try {
      const p = join(dir, f);
      if (Date.now() - statSync(p).mtimeMs > WEEK_MS) unlinkSync(p);
    } catch {
      // gone already, or not ours to delete
    }
  }
}

function main() {
  const terminal = process.env.HC_TERMINAL_ID;
  if (!terminal || !/^[A-Za-z0-9_-]+$/.test(terminal)) return;
  const input = JSON.parse(readFileSync(0, "utf8"));
  const event = input.hook_event_name;
  // PermissionRequest and PreToolUse fire on every tool call: patch the file, never read the transcript.
  const fast = event === "PermissionRequest" || event === "PreToolUse";
  if (!fast && !input.transcript_path) return;

  const dir = join(homedir(), ".config", "herdr-kit", "names");
  const file = join(dir, `${terminal}.json`);
  let prev = null;
  try {
    prev = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    prev = null;
  }
  // A new session in the same terminal starts fresh; the same session keeps
  // its name when the title fell out of the tail we read.
  const same = prev && prev.session_id === input.session_id;
  const now = Date.now();
  const keep = (k) => (same ? (prev[k] ?? null) : null);
  let next;
  let tail = "";
  if (fast) {
    // Hot path (every tool call): no transcript read, just patch the file.
    next = {
      name: same ? prev.name : null,
      hint: same ? prev.hint : null,
      session_id: input.session_id ?? null,
      at: same ? prev.at : now,
      ask: same ? (prev.ask ?? null) : null,
      tool: same ? (prev.tool ?? null) : null,
      card: same ? (prev.card ?? null) : null,
      runs: same ? (prev.runs ?? []) : [],
      asks: same ? (prev.asks ?? []) : [],
      note_turn: same ? Boolean(prev.note_turn) : false,
      ask_turn: same ? Boolean(prev.ask_turn) : false,
      menu: same ? (prev.menu ?? null) : null,
      perm: same ? (prev.perm ?? null) : null,
      ask_text: same ? (prev.ask_text ?? null) : null,
      said: same ? (prev.said ?? null) : null,
    };
  } else {
    tail = readTail(input.transcript_path);
    const { custom, ai } = latestTitles(tail);
    // First sight of this session (fresh install, or resumed in a new
    // terminal): an old /rename may sit before the tail, so read it all once.
    const name = custom ?? (same ? prev.name : latestTitles(readFileSync(input.transcript_path, "utf8")).custom);
    next = {
      name,
      hint: ai ?? (same ? prev.hint : null),
      session_id: input.session_id ?? null,
      at: same && prev.name === name ? prev.at : now,
      ask: keep("ask"),
      tool: keep("tool"),
      card: keep("card"),
      runs: keep("runs") ?? [],
      asks: keep("asks") ?? [],
      note_turn: same ? Boolean(prev.note_turn) : false,
      ask_turn: same ? Boolean(prev.ask_turn) : false,
      menu: keep("menu"),
      perm: keep("perm"),
      ask_text: keep("ask_text"),
      said: keep("said"),
    };
  }

  // Which card the session is on: Decide while AskUserQuestion is up, then
  // whatever the last message ended with; a new prompt clears it.
  if ((event === "PreToolUse" || event === "PermissionRequest") && input.tool_name === "AskUserQuestion") {
    next.card = "decide";
    next.menu = menuFromInput(input.tool_input);
    // The message before the menu ended the reply's text, but no Stop has read
    // it: take its Run cards now, and let the Stop after the answer add to them.
    if (input.transcript_path) {
      next.runs = mergeRuns(next.runs, runCards(turnText(readTail(input.transcript_path))));
      next.ask_turn = true;
    }
  } else if (event === "UserPromptSubmit" && isRunNote(input.prompt)) {
    // The ▶ Run terminal reporting back, not the user: the cards stay.
    next.note_turn = true;
  } else if (event === "UserPromptSubmit") {
    next.card = null;
    next.runs = [];
    next.asks = [];
    next.note_turn = false;
    next.ask_turn = false;
    next.menu = null;
    next.perm = null;
    next.ask_text = null;
    next.said = null;
  } else if (event === "Stop") {
    const text = typeof input.last_assistant_message === "string" && input.last_assistant_message ? input.last_assistant_message : lastAssistantText(tail);
    const fresh = runCards(text);
    if (next.note_turn || next.ask_turn) {
      // A reply to a Run note, or the rest of a turn that asked a question,
      // keeps the list and only adds new cards.
      next.runs = mergeRuns(next.runs, fresh);
      next.card = cardKind(text) ?? (next.runs.length ? "run" : next.card);
      next.asks = askCards(text).length ? askCards(text) : next.asks;
    } else {
      next.card = cardKind(text);
      next.runs = fresh;
      next.asks = askCards(text);
    }
    next.note_turn = false;
    next.ask_turn = false;
    next.menu = null;
    next.perm = null;
    next.ask_text = askText(text);
    next.said = lastSaid(text);
  } else if (event === "PermissionRequest") {
    const ti = input.tool_input;
    const detail = ti?.command ?? ti?.file_path ?? summarizeAsk(input.tool_name, ti);
    next.perm = { tool: String(input.tool_name ?? ""), detail: String(detail ?? "") };
    // Bash's own description of the command: the one extra line its permission box shows, so the deck can tell it from a second command line.
    if (input.tool_name === "Bash" && typeof ti?.description === "string" && ti.description.trim()) next.perm.description = ti.description;
  } else if (event === "PreToolUse") {
    next.menu = null;
    next.perm = null;
  }

  // When this card first showed, so herdr can fade one left unanswered.
  next.card_at = next.card && same && prev.card === next.card ? (prev.card_at ?? now) : next.card ? now : null;

  if (event === "PermissionRequest") {
    next.ask = { text: summarizeAsk(input.tool_name, input.tool_input), at: now };
  } else if (event === "PreToolUse") {
    next.tool = { text: summarizeTool(input.tool_name, input.tool_input), at: now };
    next.ask = null;
  } else if (event === "UserPromptSubmit" || event === "Stop" || event === "SessionStart") {
    next.ask = null;
    next.tool = null;
  }

  if (event === "SessionStart") {
    try {
      cleanStale(dir, `${terminal}.json`);
    } catch {
      // no folder yet
    }
  }
  // The pane's folder can sit on another branch than the one this session works in.
  next.branch = gitBranch(input.cwd) ?? keep("branch");
  // Same state: skip the write, keeping the old timestamps.
  const strip = (o) => JSON.stringify({ ...o, ask: o.ask?.text ?? null, tool: o.tool?.text ?? null });
  if (prev && strip(prev) === strip(next)) return;
  mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(next) + "\n");
  renameSync(tmp, file);
}

try {
  main();
} catch {
  // a hook must never block Claude
}
process.exit(0);
