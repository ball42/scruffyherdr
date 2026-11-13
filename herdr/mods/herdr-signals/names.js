// Works out what to call each Claude, and which tabs to rename to match.
// Names belong to terminals, not tabs (a split tab can hold two Claudes).
// Sources, newest wins: the session's /rename (the hook's names file, `at`)
// and a tab name the user typed (timed from when the mod first saw it). Without
// either: a ticket key in the git branch, Claude's own session title, then "space · tab".
// Pure: no herdr globals, no I/O.

const MAX_NAME = 40;
// ponytail: shape-only match, so a branch like "feature-12" reads as FEATURE-12; add a project allow-list if that bites.
const BRANCH_KEY = /(?:^|[/_-])([A-Za-z][A-Za-z0-9]+-\d{2,})(?=$|[/_-])/;

/** "user/acme-2312-retry" -> "ACME-2312"; no key -> null. */
export function branchTicket(branch) {
  const m = String(branch ?? "").match(BRANCH_KEY);
  return m ? m[1].toUpperCase() : null;
}

const ID = /^[a-z0-9]{1,16}$/;
const small = (n) => Number.isInteger(n) && n >= 1 && n <= 99;

/** A Run card from the names file: label, command, and id / step / of when valid. */
function cleanRun(r) {
  const out = { label: r.label, command: r.command };
  if (typeof r.id === "string" && ID.test(r.id)) out.id = r.id;
  if (small(r.step) && small(r.of) && r.step <= r.of) Object.assign(out, { step: r.step, of: r.of });
  return out;
}

const MAX_DETAIL = 300;
const MAX_SAID = 600;
const text = (v) => (typeof v === "string" ? v : "");

/** The AskUserQuestion menu from the names file, or null. Questions with no options are dropped. */
function cleanMenu(m) {
  if (!m || typeof m !== "object" || !Array.isArray(m.questions)) return null;
  const questions = m.questions
    .filter((q) => q && typeof q === "object" && Array.isArray(q.options))
    .map((q) => ({
      header: text(q.header),
      question: text(q.question),
      multi: q.multi === true,
      options: q.options
        .filter((o) => o && typeof o.label === "string")
        .map((o) => ({ label: o.label, description: text(o.description) })),
    }))
    .filter((q) => q.options.length);
  return questions.length ? { questions } : null;
}

/** The permission prompt from the names file as {tool, detail, description?}, or null. Detail and description are cut to 300 characters. */
function cleanPerm(p) {
  if (!p || typeof p !== "object" || typeof p.tool !== "string" || typeof p.detail !== "string") return null;
  const out = { tool: p.tool, detail: Array.from(p.detail).slice(0, MAX_DETAIL).join("") };
  if (typeof p.description === "string" && p.description.trim()) out.description = Array.from(p.description).slice(0, MAX_DETAIL).join("");
  return out;
}

export function initialNamesMemo() {
  return { setByUs: {}, tabSeen: {} };
}

/** Strips control characters, collapses whitespace, caps at 40 chars. */
export function sanitizeName(s) {
  const clean = String(s ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const cps = Array.from(clean);
  return cps.length > MAX_NAME ? `${cps.slice(0, MAX_NAME - 1).join("")}…` : clean;
}

/**
 * @param memo from initialNamesMemo() or the last call
 * @param input {agents: [{address, tab, tab_name, tab_named, space_name, branch?}],
 *               files: {[address]: {name, hint, at}}, now}
 * @returns {{memo, names: Record<string, {name, hint, source}>, renames: {tab, name}[]}}
 */
export function resolveNames(memo, { agents, files, now }) {
  const next = { setByUs: {}, tabSeen: {} };
  const perTab = {};
  for (const a of agents) perTab[a.tab] = (perTab[a.tab] ?? 0) + 1;

  const names = {};
  for (const a of agents) {
    const single = perTab[a.tab] === 1;
    const file = files[a.address];
    const fileName = file && file.name ? sanitizeName(file.name) : "";
    const hint = file && file.hint ? sanitizeName(file.hint) : null;
    const ticket = branchTicket((file && typeof file.branch === "string" && file.branch) || a.branch);
    if (memo.setByUs[a.tab] !== undefined) next.setByUs[a.tab] = memo.setByUs[a.tab];

    // A tab name we didn't set ourselves is the user's; time it from first sight.
    let tabName = "";
    let tabAt = -Infinity;
    if (single && a.tab_named && a.tab_name !== memo.setByUs[a.tab]) {
      tabName = sanitizeName(a.tab_name);
      const seen = memo.tabSeen[a.tab];
      tabAt = seen && seen.name === a.tab_name ? seen.at : now;
      next.tabSeen[a.tab] = { name: a.tab_name, at: tabAt };
    }

    if (fileName && (!tabName || file.at >= tabAt)) names[a.address] = { name: fileName, hint, source: "rename" };
    else if (tabName) names[a.address] = { name: tabName, hint, source: "tab" };
    // No /rename and no typed tab name: the session's branch ticket plus Claude's title, then the title alone.
    else if (ticket) names[a.address] = { name: sanitizeName(hint ? `${ticket} ${hint}` : ticket), hint, source: "branch" };
    else if (hint) names[a.address] = { name: hint, hint: null, source: "fallback" };
    else names[a.address] = { name: sanitizeName(`${a.space_name} · ${a.tab_name}`), hint, source: "fallback" };
  }

  for (const a of agents) {
    const f = files[a.address];
    const n = names[a.address];
    n.ask = f && f.ask && typeof f.ask.text === "string" ? f.ask.text : null;
    n.card = f && (f.card === "run" || f.card === "decide" || f.card === "ask") ? f.card : null;
    n.card_at = f && typeof f.card_at === "number" ? f.card_at : null;
    n.runs = f && Array.isArray(f.runs)
      ? f.runs.filter((r) => r && typeof r.label === "string" && typeof r.command === "string" && r.command.trim()).slice(0, 8).map(cleanRun)
      : [];
    n.tool = f && f.tool && typeof f.tool.text === "string" ? f.tool.text : null;
    n.menu = f ? cleanMenu(f.menu) : null;
    n.perm = f ? cleanPerm(f.perm) : null;
    n.ask_text = f && typeof f.ask_text === "string" ? f.ask_text : null;
    n.said = f && typeof f.said === "string" && f.said.trim() ? Array.from(f.said).slice(0, MAX_SAID).join("") : null;
  }

  // Same name twice: add the space to each so they can be told apart.
  const count = {};
  for (const n of Object.values(names)) count[n.name] = (count[n.name] ?? 0) + 1;
  for (const a of agents) {
    const n = names[a.address];
    if (count[n.name] > 1 && n.source !== "fallback") n.name = sanitizeName(`${n.name} · ${a.space_name}`);
  }

  const renames = [];
  for (const a of agents) {
    const n = names[a.address];
    if (perTab[a.tab] === 1 && n.source === "rename" && a.tab_name !== n.name) {
      renames.push({ tab: a.tab, name: n.name });
      next.setByUs[a.tab] = n.name;
    }
  }
  return { memo: next, names, renames };
}
