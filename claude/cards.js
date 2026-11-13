// The cards Claude uses when it needs something from the user, and a linter
// for a final message. Pure: no I/O. CARD_SPEC is the rules a SessionStart
// hook gives Claude, lintMessage the check a Stop hook can block on, and
// name-hook.mjs records cardKind() for the UI.

export const CARD_SPEC = `# Asking the user for things: action items made of cards

The user watches a stream of output from several sessions; asks get buried in it. So every ask has one fixed shape.

## Decisions come first: the AskUserQuestion tool

Anything the user can answer by picking is a decision, and every decision goes through the AskUserQuestion tool, never as text. That includes yes/no ("should I deploy now?", "want me to start the widget?"), approve-or-change ("is the design approved, or what should change?"), and A-or-B ("now, or wait?"). Batch all open decisions into one AskUserQuestion call: up to 4 questions, each with 2 to 4 concrete options, your recommendation first and marked "(Recommended)". The user can always type their own answer, so don't add an "other" option. Never write options as a list in prose. An offer of more work is a decision too: don't slip it into a sentence (\"I can also…\", \"I can add it if you want\", \"say the word and I'll…\", \"that's the next thing I'd look at\"); ask it in the AskUserQuestion call, or leave it out.

## Everything else: action items

A message that needs anything else from the user (a command to run, a page to check, an open-ended question) ends with a \`## Your action items\` section. No text comes after it; when there are decisions too, call AskUserQuestion right after writing it. Every item in it is a card, most urgent first. Repeat items still open from earlier messages as cards, don't refer back. When nothing is needed, don't add the section.

## Run card: something the user must do

**▶ Run:** rebuild the site

\`\`\`sh
# build the site
npm --prefix site run build
\`\`\`

**Expect:** "created ... bundle.js" and no errors

- Give a command whenever one exists: \`open <url>\` to check a page, \`gh pr merge 18\` to merge. Only a step with no possible command (press a physical button) has no fence.
- The fence has a language tag (\`sh\`) and one command per line. A \`#\` comment goes on its own line above a command, never after it. No \`$ \` prompt prefix, no \`→\`.
- Keep every line in the fence to 60 characters or fewer, the leading spaces included. The terminal wraps a longer line with real line breaks, so copying it pastes a broken command. Break a long command between arguments with a trailing \` \\\`, start the next line with two spaces, write paths with \`~\`, or \`cd\` on its own line first. A single path or URL still too long goes in a script, and the card runs the script.
- A procedure of several separate blocks goes in a runbook; its card is one \`open <runbook>\` command.
- Herdr shows each Run card on the rail with a **▶ Run** button that runs the whole block in a new terminal under your pane, in your folder, and a **Copy** button. So the block must run as-is: no placeholders like \`<N>\`, no step that waits on a later card.

## Steps that must run in order: number them

When some Run cards are steps that must run back to back, each needing the one before, number them: \`**▶ Run 1/3:**\`, \`**▶ Run 2/3:**\`, \`**▶ Run 3/3:**\`, next to each other. Herdr adds a **▶ Run all** button that runs them in one terminal, in order, and stops at the first failure. Every numbered step needs a command block. Never number a step that waits on the user doing something by hand, and leave independent cards unnumbered.

## When the user clicks ▶ Run

When a run ends, its terminal closes and types one message into your session. The user didn't type it, but it means they clicked Run. A block that only opens something (\`open\`, \`gh … --web\`, \`cd\`) and works sends nothing.

- \`[herdr-kit] ▶ Run finished: "<label>" exited <code>. Output: <log>\`, or for Run all \`[herdr-kit] ▶ Run all finished: 1/3 "<label>" exit 0; 2/3 "<label>" exit 1; 3/3 "<label>" skipped. Output: <log>\`.
- The log holds the run's stdout and stderr, kept in a log folder you choose (config \`run_log_pipe\`; \`~/.config/herdr-kit/runlogs/\` by default). Read it (the terminal is gone), say in a few lines whether it worked, and go on with whatever it unblocked. Exit 130 means the user pressed Ctrl-C.
- The rail keeps your other Run cards and shows each one's result, so don't list the cards again. Add an action items section only for a new step.

## Ask card: a free-form question

**? Ask:** what should the Stream Deck key show when no Claude is running?

- Only for an answer the user has to type: a name, a value, a description. If it could be answered yes/no or by picking, it is a decision: use AskUserQuestion.
- One question per card, on one line. No option list under it.

## Example ending

## Your action items

**▶ Run:** check the Now playing row

\`\`\`sh
open https://media.example.lan
\`\`\`

**? Ask:** which box should the record book read from?
`;

const SHELL_LANGS = new Set(["sh", "bash", "zsh", "shell", "console"]);
const RUN_LABEL = /^\*\*▶ Run(?: (\d{1,2})\/(\d{1,2}))?:\*\*/;
const ASK_LABEL = /^\*\*\? Ask:\*\*/;
const EXPECT = /^\*\*Expect:\*\*/;
const ITEMS_HEAD = /^\s{0,3}(?:#{1,6}\s+|\*\*)Your action items\b/i;
const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const LIST_ITEM = /^\s{0,3}(?:[-*+•]|\d{1,2}[.)])\s+\S/;
const OPTION_HINT = /\boptions?\b|\bprefer|\bwhich (?:one|of|do|would|should|option|approach|way|you|is|to)\b|\bshould i\b/i;
const QUESTION_END = /\?[*_"')\]]*$/;

/** Splits into prose lines and fences: {fence:false,text,i} / {fence:true,lang,lines,start,end}. */
function parse(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let open = null;
  lines.forEach((line, i) => {
    if (open) {
      const m = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
      if (m && m[1][0] === open.mark && m[1].length >= open.len) {
        open.end = i;
        blocks.push(open);
        open = null;
      } else {
        open.lines.push(line);
      }
      return;
    }
    const m = line.match(FENCE);
    if (m) {
      open = { fence: true, mark: m[1][0], len: m[1].length, lang: m[2].toLowerCase(), lines: [], start: i, end: lines.length - 1 };
    } else {
      blocks.push({ fence: false, text: line, i });
    }
  });
  if (open) blocks.push(open); // unclosed: runs to the end
  return blocks;
}

const proseOf = (blocks) => blocks.filter((b) => !b.fence);

/** True when a ` #` outside quotes starts a comment after a command on this line. */
function hasTrailingComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === "\\" && q === '"') i++;
      else if (c === q) q = null;
    } else if (c === "\\") i++;
    else if (c === "'" || c === '"' || c === "`") q = c;
    else if (c === "#" && i > 0 && /\s/.test(line[i - 1])) return true;
  }
  return false;
}

// The terminal hard-wraps a long line, so a copied command arrives broken (2026-11-06).
const MAX_CMD_LINE = 60;
const LONG_LINE = `keep each line in a command block to ${MAX_CMD_LINE} characters or fewer: break between arguments with a trailing \\, use ~ in paths, or cd on its own line first`;

function lintFence(f, reasons) {
  if (f.lines.some((l) => l.includes("→"))) reasons.add("no → in a command block");
  if (f.lines.some((l) => /^\s*\$ /.test(l))) reasons.add("no `$ ` prompt prefix in a command block");
  const cmds = f.lines.filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (cmds.some(hasTrailingComment)) reasons.add("put a # comment on its own line above the command, not after it");
  if (f.lines.some((l) => [...l].length > MAX_CMD_LINE)) reasons.add(LONG_LINE);
}

/**
 * The list the message ends with, as the index in `prose` of its first item,
 * or -1. Needs 2+ items, reaching the last non-blank line, with no fence inside.
 */
function trailingListStart(prose) {
  let end = prose.length - 1;
  while (end >= 0 && !prose[end].text.trim()) end--;
  let start = -1;
  let items = 0;
  for (let k = end; k >= 0; k--) {
    const t = prose[k].text;
    if (k < end && prose[k].i !== prose[k + 1].i - 1) break; // a fence sits between
    if (LIST_ITEM.test(t)) {
      start = k;
      items++;
    } else if (t.trim() && !/^\s{2,}\S/.test(t)) break;
  }
  return items >= 2 ? start : -1;
}

/** True when the fence at `f` is a Run card's command block. */
function isRunFence(blocks, f) {
  const j = blocks.indexOf(f);
  let k = j - 1;
  while (k >= 0 && !blocks[k].fence && !blocks[k].text.trim()) k--;
  if (k >= 0 && !blocks[k].fence && RUN_LABEL.test(blocks[k].text.trim())) return true;
  if (!SHELL_LANGS.has(f.lang)) return false;
  const after = blocks.slice(j + 1);
  if (after.some((b) => b.fence)) return false;
  const rest = after.map((b) => b.text.trim()).filter(Boolean);
  return rest.length === 0 || (rest.length === 1 && /^\*\*Expect:\*\*/.test(rest[0]));
}

const STEPS = "number steps that run in order ▶ Run 1/N to N/N, next to each other, each with a command block";

/** Numbered Run cards in the action items: 1..N in a row, same N, each with a command. */
function lintSteps(blocks, h, reasons) {
  let want = null; // {next, of} while inside a sequence
  for (let j = h + 1; j < blocks.length; j++) {
    const b = blocks[j];
    if (b.fence) continue;
    const t = b.text.trim();
    const isCard = RUN_LABEL.test(t) || ASK_LABEL.test(t);
    if (!isCard) continue;
    const m = t.match(RUN_LABEL);
    const step = m && m[1] ? { n: Number(m[1]), of: Number(m[2]) } : null;
    if (want && (!step || step.n !== want.next || step.of !== want.of)) { reasons.add(STEPS); return; }
    if (!step) continue;
    if (!want && step.n !== 1) { reasons.add(STEPS); return; }
    if (step.of < 2 || step.n > step.of) { reasons.add(STEPS); return; }
    let k = j + 1;
    while (k < blocks.length && !blocks[k].fence && !blocks[k].text.trim()) k++;
    if (!blocks[k] || !blocks[k].fence || !isCommandFence(blocks[k])) { reasons.add(STEPS); return; }
    want = step.n === step.of ? null : { next: step.n + 1, of: step.of };
  }
  if (want) reasons.add(STEPS);
}

/** Index in `blocks` of the last "Your action items" heading, or -1. */
function itemsStart(blocks) {
  for (let k = blocks.length - 1; k >= 0; k--) if (!blocks[k].fence && ITEMS_HEAD.test(blocks[k].text)) return k;
  return -1;
}

const questions = (t) => (t.replace(/`[^`]*`/g, "").replace(/https?:\/\/\S+/g, "").match(/\?[*_"')\]]*(?=\s|$)/g) ?? []).length;
const DECISION_START = /^(?:should|shall|do you want|want me to|would you like|can i|may i|ok(?:ay)? to|is it ok|approve|go ahead|proceed|ready to|is (?:that|this|it)\b|does (?:that|this)\b|do (?:i|we)\b)/i;
const DECISION_OR = /,\s*or\b|\bor (?:not|should|do|tell|wait|leave|keep|skip)\b/i;
/** True when a question can be answered by picking: yes/no, approve-or-change, A-or-B. */
export function isDecision(t) {
  // Drop a list marker and a bold lead-in ("**? Ask:**", "**Deploy:**") so the question starts the line.
  const q = t.replace(/^\s*[-*]\s+/, "").replace(/^\*\*[^*\n]{1,60}:\*\*\s*/, "").trim();
  // Judge each question sentence on its own: "Fixed. Want me to update the README?"
  return q
    .split(/(?<=[.!?])\s+/)
    .filter((x) => questions(x) > 0)
    .some((x) => DECISION_START.test(x.replace(/^\*\*[^*\n]{1,60}:\*\*\s*/, "")) || DECISION_OR.test(x));
}
const OFFER = [
  /\bI can also\b/i,
  /\bI could (?:also )?(?:add|look|check|run|write|make|build|dig|try)\b/i,
  /\bif you(?:'d)? (?:want|like)\b[^.]*\bI(?:'ll| will| can| could)\b/i,
  /\bthe next thing I'?d (?:look at|do|check|try)\b/i,
  /\blet me know if you(?:'d| would)? (?:like|want)\b/i,
  /\btell me if you(?:'d)? (?:like|want)\b/i,
  /\bhappy to (?:also )?(?:add|look|check|run|write|make|build|dig|try)\b/i,
  // The forms that got past the list above in real transcripts (2026-11-06).
  /\bI(?: can| could|'ll| will)\b[^.?!]*\bif you(?:'d)? (?:want|like|prefer)\b/i,
  /\b(?:say the word|just say (?:so|which|go|the word))\b/i,
  /\b(?:whenever|once|when) you say (?:go|so|the word)\b/i,
  /\bI can (?:also )?(?:add|file|open|write|build|run|do|take|look|dig|draft|wire|fix|set up|turn|make|send|start)\b[^.?!]*\b(?:next|too|as well|separately|as an? (?:ticket|PR|issue|follow-?up)|in an? (?:small |separate |follow-?up )?PR|whenever)\b/i,
  /\bmeanwhile,? I can\b/i,
  /\bunless you(?:'d)? (?:want|like|prefer)\b/i,
  /\bI'?d (?:suggest|recommend)\b[^.?!]*\bnext\b|\bnext (?:\w+ )?step I'?d (?:suggest|recommend|take)\b/i,
  /\b(?:possible|natural|obvious|easy) (?:follow-?up|next step)\b/i,
  /\bworth (?:a |its own )?(?:separate |follow-?up )?(?:ticket|PR|issue)\b/i,
  /\btell me (?:to \w+|and I'?ll)\b/i,
  /\bif you'?d rather\b[^.?!]*\b(?:say so|I'?ll|I can|I could|have me)\b|\bsay so\b[^.?!]*\bif you'?d rather\b/i,
];
const OFFER_REASON = "a sentence offers more work: ask it as a decision in AskUserQuestion, or drop it";
const DECIDE = "that question is a decision: ask it with AskUserQuestion (batch up to 4 questions in one call, recommended option first), not as text";
// Quoted text is an example, not an offer or a decision: drop "…", “…” and `…` spans first.
const unquoted = (t) => t.replace(/`[^`]*`/g, "").replace(/"[^"]*"/g, "").replace(/“[^”]*”/g, "");
const isCommandFence = (f) => f.lang === "" || SHELL_LANGS.has(f.lang);

/** Prose block before index j (skipping blanks), or null. */
function proseBefore(blocks, j, floor = 0) {
  let k = j - 1;
  while (k >= floor && !blocks[k].fence && !blocks[k].text.trim()) k--;
  return k >= floor && !blocks[k].fence ? blocks[k] : null;
}

/** The card the message ends with when it has no action items section. */
function closingCard(blocks) {
  let k = blocks.length - 1;
  let expect = false;
  while (k >= 0 && !blocks[k].fence) {
    const t = blocks[k].text.trim();
    if (t) {
      if (!expect && EXPECT.test(t)) expect = true;
      else break;
    }
    k--;
  }
  if (k >= 0 && blocks[k].fence) {
    const label = proseBefore(blocks, k);
    return (label && RUN_LABEL.test(label.text.trim())) || SHELL_LANGS.has(blocks[k].lang) ? "run" : null;
  }
  if (!blocks.length || blocks[blocks.length - 1].fence) return null;
  const end = blocks[k]?.text.trim() ?? "";
  if (RUN_LABEL.test(end)) return "run";
  if (ASK_LABEL.test(end)) return "ask";
  if (LIST_ITEM.test(end)) return null;
  return QUESTION_END.test(end) ? "ask" : null;
}

/** One short reason per violation; [] when the message is fine. */
export function lintMessage(text) {
  const reasons = new Set();
  const blocks = parse(text);
  const prose = proseOf(blocks);
  const fences = blocks.filter((b) => b.fence);
  const h = itemsStart(blocks);

  // 1. The message ends with a list that reads as options.
  const last = blocks[blocks.length - 1];
  if (last && !last.fence) {
    const start = trailingListStart(prose);
    if (start > 0) {
      let k = start - 1;
      while (k >= 0 && !prose[k].text.trim()) k--;
      const lead = k >= 0 && prose[k].i + (start - k) === prose[start].i ? prose[k].text.trim() : "";
      if (lead && !LIST_ITEM.test(lead) && (QUESTION_END.test(lead) || OPTION_HINT.test(lead))) {
        reasons.add("use AskUserQuestion for options instead of a list in prose");
      }
    }
  }

  if (h >= 0) {
    // 2. Inside the action items, every item is a card.
    lintSteps(blocks, h, reasons);
    for (let j = h + 1; j < blocks.length; j++) {
      const b = blocks[j];
      if (b.fence) {
        if (!isCommandFence(b)) continue;
        lintFence(b, reasons);
        const label = proseBefore(blocks, j, h + 1);
        if (!label || !RUN_LABEL.test(label.text.trim())) reasons.add("start each command block in Your action items with a **▶ Run:** line");
        continue;
      }
      const t = b.text.trim();
      if (!t || EXPECT.test(t)) continue;
      if (isDecision(t)) {
        reasons.add(DECIDE);
      } else if (ASK_LABEL.test(t)) {
        if (questions(t.replace(ASK_LABEL, "")) > 1) reasons.add("one question per **? Ask:** card");
      } else if (questions(t) > 0) {
        reasons.add("start each question in Your action items with **? Ask:**");
      } else if (LIST_ITEM.test(t)) {
        reasons.add("write each action item as a card (**▶ Run:** or **? Ask:**), not a list item");
      }
    }
  } else {
    // 3. A card, or an ask the message ends with, goes under the heading.
    for (const f of fences) if (isRunFence(blocks, f)) lintFence(f, reasons);
    const labelled = prose.some((p) => RUN_LABEL.test(p.text.trim()) || ASK_LABEL.test(p.text.trim()));
    const closing = closingCard(blocks);
    const lastLine = [...prose].reverse().find((p) => p.text.trim());
    const closesOnDecision = closing === "ask" && lastLine && isDecision(unquoted(lastLine.text.trim()));
    if ((labelled || closing) && !closesOnDecision) reasons.add("end with a ## Your action items section and put each ask in it as a card");
  }

  // 5. A decision asked as text anywhere outside the action items, not just as the closing line.
  const body = h >= 0 ? prose.filter((p) => p.i < blocks[h].i) : prose;
  if (body.some((p) => isDecision(unquoted(p.text.trim())))) reasons.add(DECIDE);

  // 6. An offer of more work hidden in a sentence (outside the action items).
  if (body.some((p) => OFFER.some((re) => re.test(unquoted(p.text))))) reasons.add(OFFER_REASON);

  // 4. "Run `cmd`" in prose, with no fenced block anywhere in the message.
  if (!fences.length) {
    const flat = prose.map((p) => p.text).join("\n");
    const phrase =
      /(?:^|[.!?:]\s+|\n\s*(?:[-*]\s+)?)run\s+[^.\n`]{0,40}`[^`\n]+`|\b(?:please\s+run|(?:you(?:'ll| will)?\s+(?:need|have)\s+to|you\s+(?:can|could|should|must)|can you|could you)\s+run)\s+[^.\n`]{0,40}`[^`\n]+`/i;
    if (phrase.test(flat)) reasons.add("put the command in a Run card (a fenced block), not inline");
  }

  return [...reasons];
}

/** The kind of input the message asks for: "run" when any Run card is open, else "ask", else null. */
export function cardKind(text) {
  const blocks = parse(text);
  const h = itemsStart(blocks);
  if (h < 0) return closingCard(blocks);
  let run = false;
  let ask = false;
  for (const b of blocks.slice(h + 1)) {
    if (b.fence) run = run || isCommandFence(b);
    else if (RUN_LABEL.test(b.text.trim())) run = true;
    else if (ASK_LABEL.test(b.text.trim()) || QUESTION_END.test(b.text.trim())) ask = true;
  }
  return run ? "run" : ask ? "ask" : null;
}

const MAX_RUNS = 8;

/**
 * A short stable id for a Run card (FNV-1a over label, command and the message
 * it came from): names its state file and its ✕ dismissal. The message is in it
 * so a card re-posted in a new message is a new card, not the old dismissed one
 * with the old run's result.
 */
export function runId(label, command, message = "") {
  let h = 0x811c9dc5;
  for (const ch of `${label}\u0000${command}\u0000${message}`) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** True when the text is a note the ▶ Run terminal typed, not the user. */
export const RUN_NOTE_PREFIX = "[herdr-kit] ▶ Run";
export function isRunNote(text) {
  return typeof text === "string" && text.trimStart().startsWith(RUN_NOTE_PREFIX);
}

/**
 * Adds `fresh` cards to `kept` (by id), keeping kept's order. A reply to a
 * Run note keeps the list and only adds new cards.
 */
export function mergeRuns(kept, fresh) {
  const out = [...(kept ?? [])];
  const seen = (r) => `${r.step ?? ""}/${r.of ?? ""}\u0000${r.label}\u0000${r.command}`;
  const ids = new Set(out.map((r) => r.id));
  const texts = new Set(out.map(seen));
  for (const r of fresh ?? []) {
    // The same card read from two views of one turn (the text before a question,
    // then the last message) has two ids: keep the first.
    if (ids.has(r.id) || texts.has(seen(r)) || out.length >= MAX_RUNS) continue;
    out.push(r); ids.add(r.id); texts.add(seen(r));
  }
  return out;
}
const MAX_LABEL = 200;
const MAX_COMMAND = 4000;

/**
 * The Run cards a message ends with that carry a command block, for Herdr's
 * Run and Copy buttons: [{label, command}]. Reads the action items section,
 * or the whole message when it has none (a closing card).
 */
export function runCards(text) {
  const blocks = parse(text);
  const h = itemsStart(blocks);
  const out = [];
  for (let j = h + 1; j < blocks.length && out.length < MAX_RUNS; j++) {
    const b = blocks[j];
    if (b.fence || !RUN_LABEL.test(b.text.trim())) continue;
    let k = j + 1;
    while (k < blocks.length && !blocks[k].fence && !blocks[k].text.trim()) k++;
    const f = blocks[k];
    if (!f || !f.fence || !isCommandFence(f)) continue;
    const command = f.lines.join("\n").trim();
    if (!command || command.length > MAX_COMMAND) continue;
    const m = b.text.trim().match(RUN_LABEL);
    const label = Array.from(b.text.trim().replace(RUN_LABEL, "").replace(/\*\*/g, "").trim()).slice(0, MAX_LABEL).join("");
    const card = { id: runId(label, command, text), label, command };
    if (m[1]) Object.assign(card, { step: Number(m[1]), of: Number(m[2]) });
    out.push(card);
    j = k;
  }
  return out;
}

const MAX_ASKS = 8;

/** The question text of each ? Ask card in the action items section. */
export function askCards(text) {
  const blocks = parse(text);
  const h = itemsStart(blocks);
  if (h < 0) return [];
  return blocks.slice(h + 1)
    .filter((b) => !b.fence && ASK_LABEL.test(b.text.trim()))
    .map((b) => Array.from(b.text.trim().replace(ASK_LABEL, "").trim()).slice(0, MAX_LABEL).join(""))
    .filter(Boolean)
    .slice(0, MAX_ASKS);
}

/** The last assistant message with text in a transcript (JSONL) tail, or "". */
export function lastAssistantText(transcript) {
  let out = "";
  for (const line of String(transcript ?? "").split("\n")) {
    if (!line.includes('"assistant"')) continue;
    try {
      const rec = JSON.parse(line);
      const m = rec?.message;
      if (rec?.type !== "assistant" && m?.role !== "assistant") continue;
      const c = m?.content;
      const t =
        typeof c === "string"
          ? c
          : Array.isArray(c)
            ? c.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n")
            : "";
      if (t.trim()) out = t;
    } catch {
      // partial first line or junk
    }
  }
  return out;
}

/**
 * The last assistant text written since the user's last real prompt, or "".
 * Tool results and meta records aren't prompts. Used when AskUserQuestion
 * starts: the message before the menu is in the transcript, but no Stop has
 * read it yet, and an earlier turn's text must not count.
 */
export function turnText(transcript) {
  let out = "";
  for (const line of String(transcript ?? "").split("\n")) {
    if (!line.includes('"user"') && !line.includes('"assistant"')) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue; // partial first line or junk
    }
    const m = rec?.message;
    const c = m?.content;
    if ((rec?.type === "user" || m?.role === "user") && !rec?.isMeta) {
      const prompt = typeof c === "string" || (Array.isArray(c) && !c.some((b) => b?.type === "tool_result"));
      if (prompt) out = "";
      continue;
    }
    if (rec?.type !== "assistant" && m?.role !== "assistant") continue;
    const t = typeof c === "string" ? c : Array.isArray(c) ? c.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n") : "";
    if (t.trim()) out = t;
  }
  return out;
}

const cut = (v, n) => Array.from(String(v ?? "").trim()).slice(0, n).join("");

/**
 * The AskUserQuestion menu from a tool input: up to 4 questions of up to 4
 * options each, strings trimmed and cut. Null when no question is valid.
 */
export function menuFromInput(toolInput) {
  const qs = Array.isArray(toolInput?.questions) ? toolInput.questions : [];
  const questions = [];
  for (const q of qs) {
    const question = cut(q?.question, 300);
    if (!question) continue;
    const options = (Array.isArray(q.options) ? q.options : [])
      .map((o) => ({ label: cut(o?.label, 80), description: cut(o?.description, 200) }))
      .filter((o) => o.label)
      .slice(0, 4);
    questions.push({ header: cut(q.header, 80), question, multi: q.multiSelect === true, options });
    if (questions.length === 4) break;
  }
  return questions.length ? { questions } : null;
}

/**
 * What a finished message asks: the last ? Ask card's text, else its last
 * paragraph when that ends with a question mark, else null. Cut to 500.
 */
export function askText(text) {
  const blocks = parse(text).filter((b) => !b.fence && b.text.trim());
  for (let i = blocks.length - 1; i >= 0; i--) {
    const t = blocks[i].text.trim();
    if (ASK_LABEL.test(t)) return cut(t.replace(ASK_LABEL, ""), 500) || null;
  }
  const last = blocks[blocks.length - 1]?.text.trim();
  return last && QUESTION_END.test(last) ? cut(last, 500) : null;
}

const SAID_MAX = 600;

/** One prose line as plain text: no heading, bold, code ticks, link targets or list markers. */
function plainLine(line) {
  return line
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s*>\s?/, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "• ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What a finished message said, for the rail's peek: its prose before the
 * action items, as plain text, one line per paragraph or list item. Code
 * blocks, tables and rules are dropped. Cut to 600 characters; null when
 * nothing is left.
 */
export function lastSaid(text) {
  let blocks = parse(text);
  const h = itemsStart(blocks);
  if (h >= 0) blocks = blocks.slice(0, h);
  const paras = [];
  let cur = [];
  const flush = () => { if (cur.length) paras.push(cur.join(" ")); cur = []; };
  for (const b of blocks) {
    if (b.fence) { flush(); continue; }
    const raw = b.text;
    if (!raw.trim() || /^\s*\|/.test(raw) || /^\s*(?:[-*_]\s*){3,}$/.test(raw)) { flush(); continue; }
    const line = plainLine(raw);
    if (!line) continue;
    if (line.startsWith("• ") || /^\s{0,3}#/.test(raw)) flush();
    cur.push(line);
    if (/^\s{0,3}#/.test(raw)) flush();
  }
  flush();
  const out = paras.join("\n");
  if (!out) return null;
  const cps = Array.from(out);
  return cps.length > SAID_MAX ? `${cps.slice(0, SAID_MAX - 1).join("").trimEnd()}…` : out;
}
