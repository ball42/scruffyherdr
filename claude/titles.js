// Reads session titles out of a Claude Code transcript (JSONL).
// `/rename` writes {"type":"custom-title","customTitle":...}; Claude's own
// summary is {"type":"ai-title","aiTitle":...}. Last one of each wins.

/** @returns {{custom: string|null, ai: string|null}} */
export function latestTitles(text) {
  let custom = null;
  let ai = null;
  for (const line of text.split("\n")) {
    if (!line.includes('-title"')) continue; // cheap filter before parsing
    try {
      const rec = JSON.parse(line);
      if (rec.type === "custom-title" && typeof rec.customTitle === "string") custom = rec.customTitle;
      if (rec.type === "ai-title" && typeof rec.aiTitle === "string") ai = rec.aiTitle;
    } catch {
      // a partial first line from reading the tail, or junk: skip it
    }
  }
  return { custom, ai };
}

/** Cuts to `max` code points (never splits a surrogate pair), ending in "…" when cut. */
export function truncate(s, max) {
  const cps = Array.from(String(s ?? ""));
  return cps.length > max ? `${cps.slice(0, max - 1).join("")}…` : cps.join("");
}

const squash = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const base = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() ?? "";

/** PermissionRequest text: "<tool>: <summary>", at most 80 characters. */
export function summarizeAsk(toolName, input) {
  const i = input ?? {};
  // AskUserQuestion: the question itself; the ◆ glyph already says it's a decision.
  const q = Array.isArray(i.questions) ? i.questions.find((x) => typeof x?.question === "string" && squash(x.question)) : null;
  if (q) return truncate(squash(q.question), 80);
  const raw = [i.command, i.file_path, i.url, i.pattern, i.description].find((v) => typeof v === "string" && v);
  const name = squash(toolName) || "Tool";
  return truncate(raw ? `${name}: ${squash(raw)}` : name, 80);
}

/** PreToolUse text: "Edit grid.js" or "Bash: npm test", at most 60 characters. */
export function summarizeTool(toolName, input) {
  const i = input ?? {};
  const name = squash(toolName) || "Tool";
  if (name === "Bash" && typeof i.command === "string" && squash(i.command)) {
    return truncate(`Bash: ${Array.from(squash(i.command)).slice(0, 40).join("")}`, 60);
  }
  if (["Edit", "Write", "Read", "MultiEdit", "NotebookEdit"].includes(name) && typeof i.file_path === "string" && i.file_path) {
    return truncate(`${name} ${base(i.file_path)}`, 60);
  }
  return truncate(name, 60);
}
