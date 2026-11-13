// PR state for a Claude (the "#1645" in its name, else its branch's PR).
// Pure: no herdr globals, no I/O.

const TRUNK = new Set(["main", "master", "develop"]);
export const PR_FIELDS = "number,url,state,isDraft,reviewDecision,statusCheckRollup";

/** What to hand `gh pr view`: the name's #number, else a non-trunk branch, else null. */
export function prRef(name, branch) {
  const m = String(name ?? "").match(/#(\d+)\b/);
  if (m) return m[1];
  return branch && !TRUNK.has(branch) ? branch : null;
}

/** `gh pr view --json` stdout -> {number, state, draft, review, checks} or null. */
export function parsePr(stdout) {
  let d;
  try {
    d = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!d || typeof d.number !== "number") return null;
  return { number: d.number, url: d.url || null, state: d.state, draft: Boolean(d.isDraft), review: d.reviewDecision || null, checks: rollup(d.statusCheckRollup) };
}

// Check runs carry status/conclusion; legacy status contexts carry state.
function rollup(runs) {
  let pending = false;
  for (const c of Array.isArray(runs) ? runs : []) {
    const v = c.conclusion ?? c.state ?? null;
    if (["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED"].includes(v)) return "fail";
    if (c.status && c.status !== "COMPLETED") pending = true;
    if (v === "PENDING" || v === "EXPECTED") pending = true;
  }
  return pending ? "pending" : "pass";
}

// Shape, not hue, carries the meaning (deuteranopia).
const CHECK_MARK = { pass: "●", fail: "✕", pending: "◐" };

/** "#1645 ●", "#1645 ✕ draft", "#1645 merged". */
export function prMark(pr) {
  if (pr.state === "MERGED") return `#${pr.number} merged`;
  if (pr.state === "CLOSED") return `#${pr.number} closed`;
  const bits = [`#${pr.number} ${CHECK_MARK[pr.checks]}`];
  if (pr.draft) bits.push("draft");
  else if (pr.review === "APPROVED") bits.push("approved");
  else if (pr.review === "CHANGES_REQUESTED") bits.push("changes");
  return bits.join(" ");
}

// One GraphQL call for every Claude's PR, in place of one `gh pr view` each.

/** owner/name from an origin URL (https, ssh or scp form) on github.com, else null. */
export function repoOf(url) {
  const m = String(url ?? "").trim().match(/github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], name: m[2] } : null;
}

const PR_NODE = "number url state isDraft reviewDecision commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }";

/**
 * `items`: [{key, owner, name, ref}]. One query with an alias per repo and per
 * ref: a number is that PR, a branch is its newest PRs (open wins, as with gh).
 * Returns {query, aliases: {key: [repoAlias, refAlias]}}; query null when empty.
 */
export function prQuery(items) {
  const repos = new Map();
  const aliases = {};
  items.forEach((it, i) => {
    const id = `${it.owner}/${it.name}`;
    if (!repos.has(id)) repos.set(id, { alias: `r${repos.size}`, owner: it.owner, name: it.name, fields: [] });
    const r = repos.get(id);
    const a = `p${i}`;
    const field = /^\d+$/.test(it.ref)
      ? `${a}: pullRequest(number: ${it.ref}) { ${PR_NODE} }`
      : `${a}: pullRequests(headRefName: ${JSON.stringify(it.ref)}, first: 5, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { ${PR_NODE} } }`;
    r.fields.push(field);
    aliases[it.key] = [r.alias, a];
  });
  if (!repos.size) return { query: null, aliases };
  const body = [...repos.values()].map((r) => `${r.alias}: repository(owner: ${JSON.stringify(r.owner)}, name: ${JSON.stringify(r.name)}) { ${r.fields.join(" ")} }`);
  return { query: `query { ${body.join(" ")} }`, aliases };
}

const GQL_CHECKS = { SUCCESS: "pass", FAILURE: "fail", ERROR: "fail", PENDING: "pending", EXPECTED: "pending" };

function fromNode(n) {
  if (!n || typeof n.number !== "number") return null;
  const state = n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null;
  return { number: n.number, url: n.url || null, state: n.state, draft: Boolean(n.isDraft), review: n.reviewDecision || null, checks: GQL_CHECKS[state] ?? "pass" };
}

/** `gh api graphql` stdout + prQuery's aliases -> {key: pr} (same shape as parsePr). Missing PRs are left out. */
export function parsePrBatch(stdout, aliases) {
  let d;
  try {
    d = JSON.parse(stdout)?.data;
  } catch {
    return {};
  }
  const out = {};
  for (const [key, [ra, pa]] of Object.entries(aliases)) {
    const v = d?.[ra]?.[pa];
    const node = Array.isArray(v?.nodes) ? (v.nodes.find((n) => n?.state === "OPEN") ?? v.nodes[0]) : v;
    const pr = fromNode(node);
    if (pr) out[key] = pr;
  }
  return out;
}
