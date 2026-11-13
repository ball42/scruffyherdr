// Pure helpers for answering a blocked Claude Code session from the rail:
// parse the permission prompt, build the key/text steps. No gpui, no I/O.

// How free text reaches a focused input: pasted as one block (the paste presses Enter itself).
export const TEXT_METHOD = "paste";

export function isRemote(address) {
  return String(address).includes("/");
}

export function parsePermission(screen) {
  const lines = String(screen || "").split("\n");
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes("Do you want to proceed?")) { at = i; break; }
  }
  if (at < 0) return null;
  const options = [];
  for (const l of lines.slice(at + 1)) {
    const m = l.match(/^\s*(?:❯\s*)?(\d+)\.\s+(.+?)\s*$/);
    if (m) options.push({ n: Number(m[1]), label: m[2] });
    else if (options.length && l.trim() === "") break;
  }
  const no = options.find((o) => /^No\b/.test(o.label));
  if (options.length < 2 || !no) return null;
  return { options, deny: no.n };
}

export function permissionSteps(p, choice) {
  if ("n" in choice) return [{ keys: [String(choice.n)] }];
  const reason = choice.deny.trim();
  if (!reason) return [{ keys: [String(p.deny)] }];
  return [{ keys: Array(p.deny - 1).fill("down") }, { keys: ["tab"] }, { text: reason }];
}

export function menuSteps(menu, answers) {
  const qs = menu.questions;
  if (answers.length !== qs.length) return null;
  const steps = [];
  for (let qi = 0; qi < qs.length; qi++) {
    const { multi, options } = qs[qi];
    const { picks, other } = answers[qi];
    const len = options.length;
    const otherN = len + 1;
    if (new Set(picks).size !== picks.length) return null;
    if (picks.some((n) => !Number.isInteger(n) || n < 1 || n > otherN)) return null;
    const hasOther = picks.includes(otherN);
    if (hasOther && !String(other || "").trim()) return null;
    const last = qi === qs.length - 1;
    if (!multi) {
      if (picks.length !== 1) return null;
      if (!hasOther) steps.push({ keys: [String(picks[0])] });
      else {
        if (len) steps.push({ keys: Array(len).fill("down") });
        steps.push({ text: other });
      }
    } else {
      if (!picks.length) return null;
      if (!last && !hasOther) {
        steps.push({ keys: picks.map(String) }, { keys: ["right"] });
      } else {
        const walk = [];
        for (let i = 1; i <= len; i++) {
          if (picks.includes(i)) walk.push("enter");
          walk.push("down");
        }
        steps.push({ keys: walk });
        if (hasOther) steps.push({ text: other }, { keys: ["enter"] });
        steps.push({ keys: ["down", "enter"] });
      }
    }
  }
  if (qs.length > 1 || qs[0].multi) steps.push({ keys: ["1"] });
  return steps;
}

export function replySteps(text) {
  return text ? [{ reply: text }] : [];
}

export function nextToOpen(agents, answered) {
  const ok = (a) => a.address !== answered && !a.snoozed && !isRemote(a.address);
  const blocked = agents.find((a) => ok(a) && a.attention?.kind === "blocked");
  if (blocked) return blocked.address;
  const done = agents.find((a) => ok(a) && a.attention?.kind === "done" && a.ask_text);
  return done ? done.address : null;
}

export function canAutoOpen(open) {
  return !open || !open.draft;
}

export const KEY_GAP_MS = 120;
export const CONFIRM_MS = 8000;
const POLL_MS = 400;

async function readStatus(address, h) {
  try {
    const r = await h.hc(["get", address, "--json"]);
    if (r.code !== 0) return null;
    const s = JSON.parse(r.stdout)?.status;
    return s && typeof s === "object" ? s : null;
  } catch {
    return null;
  }
}

function stepArgs(address, step) {
  if (step.keys) return ["keys", address, ...step.keys];
  if ("text" in step) return ["send", "--force", address, step.text];
  if ("reply" in step) return ["send", address, step.reply];
  return null;
}

// Check the prompt is still the one shown, send the steps, then wait for the session to move on.
// Resolves "sent" | "moved" | "stuck" | "failed". Never sends esc.
export async function sendAnswer(address, steps, shown, h) {
  if (!steps.length) return "failed";
  const argsList = steps.map((s) => stepArgs(address, s));
  if (argsList.includes(null)) return "failed";
  if (steps.some((s) => s.keys && s.keys.includes("esc"))) return "failed";
  const now = await readStatus(address, h);
  if (!now) return "failed";
  if (now.state !== shown.state || now.kind !== shown.kind || now.msg !== shown.msg) return "moved";
  for (let i = 0; i < argsList.length; i++) {
    if (i > 0) await h.sleep(KEY_GAP_MS);
    let r;
    try { r = await h.hc(argsList[i]); } catch { return "failed"; }
    if (r.code !== 0) return "failed";
  }
  for (let waited = 0; waited < CONFIRM_MS; waited += POLL_MS) {
    await h.sleep(POLL_MS);
    const s = await readStatus(address, h);
    if (s && (s.state !== shown.state || s.msg !== shown.msg)) return "sent";
  }
  return "stuck";
}

/**
 * Types `text` into a done or idle Claude's terminal, the same path as a rail
 * reply (sendAnswer with a reply step). Reads the status first as the "prompt
 * shown". Resolves as sendAnswer does.
 */
export async function sendReply(address, text, h) {
  const shown = await readStatus(address, h);
  if (!shown) return "failed";
  return sendAnswer(address, replySteps(text), shown, h);
}

/** Types "/compact" into a done or idle Claude's terminal. */
export function sendCompact(address, h) {
  return sendReply(address, "/compact", h);
}

// ---- The expanded card's view helpers (pure). ----

export const TAIL_LINES = 15;

/** The last `n` non-empty lines of a screen, right-trimmed. */
export function tailLines(screen, n = TAIL_LINES) {
  return String(screen || "").split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim()).slice(-n);
}

/**
 * The text before a plain Enter landed in a multi-line box: `prev` when `cur`
 * is `prev` with one newline put in, else `cur` unchanged.
 */
export function dropEnter(prev, cur) {
  const p = String(prev ?? ""), c = String(cur ?? "");
  if (c.length !== p.length + 1) return c;
  let i = 0;
  while (i < p.length && p[i] === c[i]) i++;
  return c[i] === "\n" && c.slice(i + 1) === p.slice(i) ? p : c;
}

/** No picks yet, one entry per question. */
export function blankAnswers(menu) {
  return (menu?.questions ?? []).map(() => ({ picks: [], other: "" }));
}

/**
 * Picks option `n` (1-based; options.length + 1 is Other) of question `qi`:
 * single-select replaces, multi-select toggles. Returns new answers.
 */
export function pickOption(answers, menu, qi, n) {
  const q = menu?.questions?.[qi];
  if (!q || !Number.isInteger(n) || n < 1 || n > q.options.length + 1) return answers;
  return answers.map((a, i) => {
    if (i !== qi) return a;
    if (!q.multi) return { ...a, picks: [n] };
    return { ...a, picks: a.picks.includes(n) ? a.picks.filter((x) => x !== n) : [...a.picks, n].sort((x, y) => x - y) };
  });
}

/**
 * What the card is asking about, for "a prompt that's gone": a blocked Claude
 * by its menu, permission and ask; a done or idle one (the same thing seen or
 * not) by its question; anything else by its status.
 */
export function promptKey(a) {
  if (a.status === "blocked") return `blocked␟${a.ask ?? ""}␟${JSON.stringify(a.menu ?? null)}␟${JSON.stringify(a.perm ?? null)}`;
  if (a.status === "done" || a.status === "idle") return `answered␟${a.ask_text ?? ""}`;
  return String(a.status ?? "");
}

/**
 * The kind of answer the card is for: "permission", "menu", "reply" or null.
 * `shown` is the Herdr status read when the card opened ({state, kind, msg}).
 */
export function blockKind(a, shown) {
  if (a.status === "blocked") {
    if (a.menu) return "menu";
    if (a.perm || shown?.kind === "permission") return "permission";
    if (shown?.kind === "question") return "menu";
    return null;
  }
  if ((a.status === "done" || a.status === "idle") && a.ask_text) return "reply";
  return null;
}

/** Whether the rail can answer it: parsed data, and the Claude is on this machine. */
export function canAnswer(kind, a, perm) {
  if (isRemote(a.address)) return false;
  if (kind === "permission") return Boolean(perm);
  if (kind === "menu") return Boolean(a.menu);
  if (kind === "reply") return Boolean(a.ask_text);
  return false;
}

/** The tool a permission is for: the hook's, else Herdr's "approve Bash: …". */
export function permTool(a, shown) {
  return a.perm?.tool || String(shown?.msg ?? "").match(/^approve\s+([^:\s]+)/)?.[1] || null;
}

/** The small-caps kind line: "✋ PERMISSION · Bash", "◆ DECISION · 2 questions", "? QUESTION". */
export function kindLabel(kind, a, shown) {
  if (kind === "permission") {
    const tool = permTool(a, shown);
    return tool ? `✋ PERMISSION · ${tool}` : "✋ PERMISSION";
  }
  if (kind === "menu") {
    const n = a.menu?.questions?.length ?? 0;
    return n ? `◆ DECISION · ${n} ${n === 1 ? "question" : "questions"}` : "◆ DECISION";
  }
  if (kind === "reply") return "? QUESTION";
  return null;
}

/** The picks of a fresh prompt: none made, the first question current, no Deny box. */
export function freshPicks(menu) {
  return { answers: blankAnswers(menu), q: 0, permPick: null, denyOpen: false };
}

/**
 * Whether the status read for the "same prompt" check is out of date: the
 * model's status no longer matches it (done turned idle, say) and no read for
 * that status has been asked for yet (`asked`).
 */
export function staleShown(status, shown, asked) {
  return Boolean(shown) && status !== shown.state && status !== asked;
}

const plain = (s) => String(s ?? "").replace(/(\*\*|__)(.+?)\1/g, "$2").replace(/`([^`]*)`/g, "$1").replace(/\s+/g, " ").trim();

/**
 * The lines of a done Claude's last reply for the open card, or [] when there
 * is nothing to peek at. A closing question the card already shows above its
 * reply box is left out, so it doesn't read twice.
 */
export function saidLines(a) {
  if (!(a?.status === "done" || a?.status === "idle") || typeof a.said !== "string") return [];
  const ask = plain(a.ask_text);
  return a.said.split("\n").map((l) => l.trim()).filter((l) => l && !(ask && plain(l) === ask));
}

/** The one-line peek on a collapsed done card: the reply's first paragraph, or null. */
export function saidGist(a) {
  if (a?.attention?.kind !== "done") return null;
  return saidLines({ ...a, ask_text: null })[0] ?? null;
}
