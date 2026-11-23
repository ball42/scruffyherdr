// The decisions log: every answer sent from the rail (a permission, a
// selection menu, a reply, a reply sent to several Claudes at once) is one
// line in a per-day file, so what was decided outlives the terminal it went to.
//
//   ~/.config/herdr-kit/decisions/<YYYY-MM-DD>.jsonl   (the local date)
//   {"at":<ms>,"name":"<Claude>","kind":"permission|menu|reply","question":"…","answer":"…"}
//
// One JSON object a line, appended. A reader takes the lines that parse and
// skips the rest (parseDecisions). Pure but for recordDecision, which takes
// its I/O as arguments: it reads the file, adds the line and writes it back
// only if it is unchanged since the read (one retry on a clash).

export const DECISIONS_DIR = ".config/herdr-kit/decisions";
export const KINDS = ["permission", "menu", "reply"];
const MAX = 300; // characters kept of a question or an answer

const clip = (v) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s;
};

/** The local date of `ms` as YYYY-MM-DD. */
export function dayKey(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The day's log under `home`. */
export function decisionPath(home, ms) {
  return `${home}/${DECISIONS_DIR}/${dayKey(ms)}.jsonl`;
}

/** The permission's question: "Bash: npm test", else Herdr's status line. */
function permQuestion(a, shown) {
  const tool = a.perm?.tool;
  const detail = a.perm?.detail;
  if (tool && detail) return `${tool}: ${detail}`;
  return tool || String(shown?.msg ?? "") || "permission";
}

/** One menu question's answer: the picked labels, "Other" as its typed text. */
function menuAnswer(q, ans) {
  const other = q.options.length + 1;
  return (ans?.picks ?? [])
    .map((n) => (n === other ? String(ans.other ?? "").trim() : q.options[n - 1]?.label))
    .filter(Boolean)
    .join(", ");
}

/**
 * What was asked and what was answered, as {kind, question, answer}, or null.
 * `kind` is blockKind's; `o` the open card ({shown, perm, permPick, answers});
 * `text` the reply or the Deny reason as typed.
 */
export function decisionOf(kind, a, o, text) {
  if (!a || !o) return null;
  if (kind === "permission") {
    const p = o.perm;
    if (!p || o.permPick == null) return null;
    const label = p.options.find((x) => x.n === o.permPick)?.label ?? String(o.permPick);
    const reason = o.permPick === p.deny ? String(text ?? "").trim() : "";
    return { kind, question: clip(permQuestion(a, o.shown)), answer: clip(reason ? `${label}: ${reason}` : label) };
  }
  if (kind === "menu") {
    const qs = a.menu?.questions ?? [];
    if (!qs.length) return null;
    const question = qs.map((q) => q.question || q.header).filter(Boolean).join(" · ");
    const answer = qs.map((q, i) => menuAnswer(q, o.answers?.[i])).filter(Boolean).join(" · ");
    return answer ? { kind, question: clip(question), answer: clip(answer) } : null;
  }
  if (kind === "reply") {
    const answer = clip(text);
    return answer ? { kind, question: clip(a.ask_text), answer } : null;
  }
  return null;
}

/** The log line for a decision `d` made at `at` for the Claude named `name`. */
export function decisionLine(d, name, at) {
  return `${JSON.stringify({ at, name: clip(name) || "Claude", kind: d.kind, question: d.question, answer: d.answer })}\n`;
}

/** The file's text with `line` added, on a line of its own. */
export function appendLine(prev, line) {
  const p = prev ?? "";
  return p && !p.endsWith("\n") ? `${p}\n${line}` : p + line;
}

/** The well-formed decisions in a day's log, oldest first; any other line is skipped. */
export function parseDecisions(text) {
  const out = [];
  for (const raw of String(text ?? "").split("\n")) {
    if (!raw.trim()) continue;
    let v;
    try { v = JSON.parse(raw); } catch { continue; }
    if (!v || typeof v !== "object" || !Number.isFinite(v.at) || !KINDS.includes(v.kind)) continue;
    if (typeof v.answer !== "string" || !v.answer) continue;
    out.push({
      at: v.at,
      name: typeof v.name === "string" && v.name ? v.name : "Claude",
      kind: v.kind,
      question: typeof v.question === "string" ? v.question : "",
      answer: v.answer,
    });
  }
  return out.sort((x, y) => x.at - y.at);
}

/**
 * Appends decision `d` to the day's log. `io`: {home, exec, readTextFile,
 * writeTextFile} (herdr's). Resolves true when the line is in; never rejects,
 * so an answer that went through is never reported as failed over its log.
 */
export async function recordDecision(d, name, at, io) {
  if (!d) return false;
  const path = decisionPath(io.home, at);
  const line = decisionLine(d, name, at);
  try {
    await io.exec("mkdir", ["-p", path.slice(0, path.lastIndexOf("/"))]);
    for (let i = 0; i < 2; i++) {
      const prev = await io.readTextFile(path);
      try {
        await io.writeTextFile(path, appendLine(prev, line), prev);
        return true;
      } catch { /* changed since the read: read it again */ }
    }
  } catch { /* no log, the answer still stands */ }
  return false;
}
