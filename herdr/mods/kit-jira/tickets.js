// Jira status for the ticket a Claude is named after (/rename ACME-12), as
// add-on badges and rows (docs/addons.md). Pure: no herdr globals, no I/O.
// main.js runs the one batched acli search and, with `jira_mine` on, the
// "my tickets" search.

// Leading key only: "Kickoff doc, excluding ACME-55" is not about ACME-55.
const KEY = /^[A-Z][A-Z0-9]+-\d+\b/;
const PROJECT = /^[A-Z][A-Z0-9]+$/;

/** The ticket key a name starts with, or null. */
export function ticketKey(name) {
  const m = String(name ?? "").match(KEY);
  return m ? m[0] : null;
}

/**
 * Whether a key's project is one to ask Jira about: any project when `projects`
 * is empty, else only those listed (so "GPT-4 notes" isn't searched).
 */
export function inProjects(key, projects) {
  if (!key) return false;
  if (!projects?.length) return true;
  return projects.includes(key.slice(0, key.lastIndexOf("-")));
}

/** An agent's ticket: its name's key, else its names-file hint's (the model's rawHint), within `projects`. */
export function agentKey(a, projects = []) {
  for (const k of [ticketKey(a?.name), ticketKey(a?.rawHint ?? a?.hint)]) {
    if (inProjects(k, projects)) return k;
  }
  return null;
}

/** Sorted, unique keys across the model's agents (an array, or an {address: agent} map): also the refetch signature. */
export function ticketKeys(agents, projects = []) {
  const keys = new Set();
  for (const a of Object.values(agents ?? {})) {
    const k = agentKey(a, projects);
    if (k) keys.add(k);
  }
  return [...keys].sort();
}

/** {[address]: key} for the model's agents on a ticket. */
export function agentKeys(agents, projects = []) {
  const out = {};
  for (const a of Object.values(agents ?? {})) {
    const k = a && typeof a.address === "string" ? agentKey(a, projects) : null;
    if (k) out[a.address] = k;
  }
  return out;
}

/** The project prefixes from config `jira_projects`: strings shaped like a key's project, upper-cased. */
export function validProjects(v) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((p) => typeof p === "string").map((p) => p.trim().toUpperCase()).filter((p) => PROJECT.test(p)))];
}

/** acli args for one search covering every key. Keys are regex-checked, so the JQL is safe. */
export function searchArgs(keys) {
  return ["jira", "workitem", "search", "--jql", `key in (${keys.join(",")})`,
    "--fields", "key,summary,status", "--limit", String(keys.length), "--json"];
}

export const MINE_LIMIT = 20; // the rail keeps at most 20 rows

/** acli args for "my tickets": the user's own JQL (config `jira_mine_jql`), passed as one argument, never through a shell. */
export function mineArgs(jql) {
  return ["jira", "workitem", "search", "--jql", jql, "--fields", "key,summary,status", "--limit", String(MINE_LIMIT), "--json"];
}

/** My tickets no Claude is named after, in Jira's order. */
export function unattended(mine, onClaudes) {
  const taken = new Set(onClaudes);
  return Object.entries(mine).filter(([k]) => !taken.has(k)).map(([key, t]) => ({ key, ...t }));
}

/** `acli ... --json` stdout -> {[key]: {status, category, summary}}. Junk -> {}. */
export function parseSearch(stdout) {
  let rows;
  try {
    rows = JSON.parse(stdout);
  } catch {
    return {};
  }
  const out = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r.key !== "string" || !KEY.test(r.key)) continue;
    const st = r.fields?.status;
    const name = typeof st?.name === "string" && st.name ? st.name : "?";
    const category = typeof st?.statusCategory?.key === "string" ? st.statusCategory.key : null;
    const summary = typeof r.fields?.summary === "string" ? r.fields.summary : "";
    out[r.key] = { status: name, category, summary };
  }
  return out;
}

// Not yet started reads by shape, not hue: orange already means "Claude needs you".
const TODO_MARK = "○ ";

/** Rail hint: "In Progress · summary", or "○ To Do · summary". */
export function ticketHint(t) {
  const head = `${t.category === "new" ? TODO_MARK : ""}${t.status}`;
  return t.summary ? `${head} · ${t.summary}` : head;
}

// A copy of herdr-signals/prs.js prMark: a mod can't import another mod's folder.
// tests/kit-jira.test.js checks it against herdr-signals'.
const CHECK_MARK = { pass: "●", fail: "✕", pending: "◐" };

/** "#12 ●", "#12 ✕ draft", "#12 merged". */
export function prMark(pr) {
  if (pr.state === "MERGED") return `#${pr.number} merged`;
  if (pr.state === "CLOSED") return `#${pr.number} closed`;
  const bits = [`#${pr.number} ${CHECK_MARK[pr.checks]}`];
  if (pr.draft) bits.push("draft");
  else if (pr.review === "APPROVED") bits.push("approved");
  else if (pr.review === "CHANGES_REQUESTED") bits.push("changes");
  return bits.join(" ");
}

/**
 * The site from config `jira_url`, such as "https://acme.atlassian.net", with
 * no trailing slash; "" for anything that isn't a plain http(s) address.
 */
export function siteUrl(v) {
  if (typeof v !== "string") return "";
  const s = v.trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s\u0000-\u001f\u007f-\u009f/?#@]+(\/[^\s\u0000-\u001f\u007f-\u009f?#]*)?$/i.test(s) ? s : "";
}

/** The ticket's page, or null with no site set. Every Claude on one ticket gets the same url, so the grid groups them. */
export function browseUrl(site, key) {
  return site ? `${site}/browse/${key}` : null;
}

// Jira's own status categories: To Do ("new") and In Progress ("indeterminate") are work in flight.
const BRIGHT = new Set(["new", "indeterminate"]);
const MAX_SHORT = 40;

/** "<KEY> <Status>", cut to the contract's 40 characters so a long status can't drop the badge. */
export function shortOf(key, status) {
  return [...`${key} ${status}`].slice(0, MAX_SHORT).join("");
}

/**
 * Badges for the model's agents on a known ticket: "In Progress · #12 ● · summary".
 * Returns {[address]: Badge}. The PR mark shows only when the model carries
 * `pr` (herdr-signals' `pr_status`).
 */
export function badges(agents, tickets, site, projects = []) {
  const items = {};
  for (const a of Object.values(agents ?? {})) {
    if (!a || typeof a.address !== "string") continue;
    const key = agentKey(a, projects);
    const t = key && tickets[key];
    if (!t) continue;
    const pr = a.pr && typeof a.pr === "object" && typeof a.pr.number === "number" ? a.pr : null;
    const parts = [ticketHint({ ...t, summary: "" }), pr && prMark(pr), t.summary];
    const badge = { text: parts.filter(Boolean).join(" · "), short: shortOf(key, t.status) };
    const url = browseUrl(site, key);
    if (url) badge.url = url;
    badge.tone = BRIGHT.has(t.category) ? "bright" : "dim";
    items[a.address] = badge;
  }
  return items;
}

/** Rows for my tickets no Claude is on: "KEY · Status", the summary under it. */
export function rows(mine, agents, site, projects = []) {
  return unattended(mine, ticketKeys(agents, projects)).slice(0, MINE_LIMIT).map((t) => {
    const row = { id: t.key, text: `${t.key} · ${t.status}` };
    if (t.summary) row.sub = t.summary;
    const url = browseUrl(site, t.key);
    if (url) row.url = url;
    return row;
  });
}
