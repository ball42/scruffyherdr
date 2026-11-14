// kit-jira's pure parts: ticket keys, acli args and output, badges and rows,
// its config, and its cadences.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ticketKey, ticketKeys, agentKey, agentKeys, inProjects, validProjects, searchArgs, mineArgs, parseSearch, ticketHint, unattended, prMark,
  badges, rows, shortOf, siteUrl, browseUrl, MINE_LIMIT,
} from "../herdr/mods/kit-jira/tickets.js";
import {
  ACLI_PLACES, DEFAULTS, KEYS, MINE_MS, REPUBLISH_MS, SEARCH_MS, acliPlaces, badgeSig, envelope, feed, isMissing, mineDue, modelAgents,
  publishDue, readJiraConfig, searchDue,
} from "../herdr/mods/kit-jira/kit.js";
import { prMark as corePrMark } from "../herdr/mods/herdr-signals/prs.js";
import { ADDON_KEYS, readAddon } from "../herdr/mods/herdr-signals/addons.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://example.atlassian.net";

test("finds a ticket key at the start of a /rename name only", () => {
  assert.equal(ticketKey("ACME-2744 #1188"), "ACME-2744");
  assert.equal(ticketKey("fix grid"), null);
  assert.equal(ticketKey("Kickoff doc, excluding ACME-55"), null);
  assert.equal(ticketKey("acme-12 lower case"), null);
  assert.equal(ticketKey(null), null);
});

test("collects unique sorted keys from names and raw hints", () => {
  const agents = [
    { address: "a", name: "ACME-9 x", rawHint: null },
    { address: "b", name: "y", rawHint: "ACME-2 z" },
    { address: "c", name: "ACME-9", rawHint: null },
  ];
  assert.deepEqual(ticketKeys(agents), ["ACME-2", "ACME-9"]);
  assert.deepEqual(ticketKeys({ a: { name: "ACME-9 x", hint: null }, b: { name: "y", hint: "ACME-2 z" } }), ["ACME-2", "ACME-9"]);
});

test("jira_projects limits which keys are asked about", () => {
  const agents = [
    { address: "a", name: "GPT-4 notes", rawHint: "ACME-3 the hint" },
    { address: "b", name: "OPS-7 x", rawHint: null },
    { address: "c", name: "ACME-9", rawHint: null },
  ];
  assert.deepEqual(ticketKeys(agents), ["ACME-9", "GPT-4", "OPS-7"], "no list: every key");
  assert.deepEqual(ticketKeys(agents, ["ACME"]), ["ACME-3", "ACME-9"], "a name outside the list falls back to the hint");
  assert.equal(agentKey(agents[1], ["ACME"]), null);
  assert.equal(inProjects("AB2-1", ["AB2"]), true);
  assert.equal(inProjects(null, []), false);
  assert.deepEqual(validProjects(["acme", "OPS", "OPS", " web ", "no-dash", 3, "", "9X"]), ["ACME", "OPS", "WEB"]);
  assert.deepEqual(validProjects("ACME"), []);
  assert.deepEqual(agentKeys([...agents, null, { name: "ACME-1" }], ["ACME"]), { a: "ACME-3", c: "ACME-9" });
});

test("builds one batched search, and the my-tickets search from the config's JQL", () => {
  assert.deepEqual(searchArgs(["ACME-2", "ACME-9"]),
    ["jira", "workitem", "search", "--jql", "key in (ACME-2,ACME-9)", "--fields", "key,summary,status", "--limit", "2", "--json"]);
  assert.deepEqual(mineArgs("assignee = currentUser()"),
    ["jira", "workitem", "search", "--jql", "assignee = currentUser()", "--fields", "key,summary,status", "--limit", String(MINE_LIMIT), "--json"]);
});

test("parses acli search json and survives junk", () => {
  const out = JSON.stringify([
    { key: "ACME-9", fields: { summary: "S", status: { name: "Review", statusCategory: { key: "indeterminate" } } } },
    null, { key: "not a key" }, { key: "ACME-10", fields: { summary: 5, status: { name: "" } } },
  ]);
  assert.deepEqual(parseSearch(out), {
    "ACME-9": { status: "Review", category: "indeterminate", summary: "S" },
    "ACME-10": { status: "?", category: null, summary: "" },
  });
  assert.deepEqual(parseSearch("✗ Error"), {});
  assert.deepEqual(parseSearch('{"key":"ACME-1"}'), {});
  assert.equal(ticketHint({ status: "Review", summary: "S" }), "Review · S");
  assert.equal(ticketHint({ status: "To Do", category: "new", summary: "S" }), "○ To Do · S");
});

test("unattended keeps my tickets no Claude is on, in order", () => {
  const mine = { "ACME-3": { status: "Review" }, "ACME-1": { status: "In Progress" }, "ACME-2": { status: "Review" } };
  assert.deepEqual(unattended(mine, ["ACME-1"]).map((t) => t.key), ["ACME-3", "ACME-2"]);
});

test("prMark is herdr-signals', copied", () => {
  const base = { number: 7, state: "OPEN", draft: false, review: null, checks: "pass" };
  const cases = [base, { ...base, checks: "fail", draft: true }, { ...base, checks: "pending" }, { ...base, review: "APPROVED" },
    { ...base, review: "CHANGES_REQUESTED" }, { ...base, state: "MERGED" }, { ...base, state: "CLOSED" }];
  for (const pr of cases) assert.equal(prMark(pr), corePrMark(pr), JSON.stringify(pr));
});

test("siteUrl takes a plain http(s) site and drops the trailing slash", () => {
  assert.equal(siteUrl("https://acme.atlassian.net/"), "https://acme.atlassian.net");
  assert.equal(siteUrl(" https://jira.example.com/jira "), "https://jira.example.com/jira");
  for (const bad of ["", "acme.atlassian.net", "https://u:p@acme.atlassian.net", "javascript:alert(1)", "https://a b", "https://x/?q=1", 3, null]) assert.equal(siteUrl(bad), "", String(bad));
  assert.equal(browseUrl("", "ACME-1"), null);
  assert.equal(browseUrl(SITE, "ACME-1"), `${SITE}/browse/ACME-1`);
});

const tickets = {
  "ACME-1645": { status: "In Progress", category: "indeterminate", summary: "Retry the upload" },
  "ACME-12": { status: "To Do", category: "new", summary: "Write the doc" },
  "ACME-7": { status: "Review", category: "indeterminate", summary: "S" },
  "ACME-8": { status: "Testing", category: "indeterminate", summary: "" },
  "ACME-9": { status: "Done", category: "done", summary: "Shipped" },
};
const openPr = { number: 1645, url: "https://github.com/o/r/pull/1645", state: "OPEN", draft: false, review: null, checks: "pass" };
const agent = (address, name, extra = {}) => ({ address, name, rawHint: null, pr: null, ...extra });

test("badge text: status, the PR mark when the model has one, then the summary; never a move", () => {
  const items = badges([
    agent("a", "ACME-1645 #1645", { pr: openPr, rawHint: "working on it" }),
    agent("b", "ACME-12 doc", { rawHint: "drafting" }),
    agent("c", "ACME-7", { pr: { ...openPr, number: 7, state: "MERGED" } }),
    agent("d", "ACME-8", { rawHint: "the names hint" }),
    agent("e", "ACME-1645 again", { pr: { ...openPr, draft: true, checks: "fail" } }),
    agent("f", "plain", { rawHint: "ACME-9 notes" }),
    agent("g", "ACME-7 junk pr", { pr: { state: "OPEN" } }),
  ], tickets, SITE);
  assert.equal(items.a.text, "In Progress · #1645 ● · Retry the upload");
  assert.equal(items.b.text, "○ To Do · Write the doc");
  assert.equal(items.c.text, "Review · #7 merged · S");
  assert.equal(items.d.text, "Testing", "a ticket with no summary drops the hint");
  assert.equal(items.e.text, "In Progress · #1645 ✕ draft · Retry the upload");
  assert.equal(items.f.text, "Done · Shipped", "the key can come from the raw hint");
  assert.equal(items.g.text, "Review · S", "a pr without a number is left out");
  for (const b of Object.values(items)) assert.equal(b.action, undefined, "kit-jira offers no moves");
});

test("no badge for a Claude off a known ticket; the core keeps its own hint there", () => {
  assert.deepEqual(badges([agent("a", "fix grid", { pr: openPr }), agent("b", "ACME-404 gone"), null, { name: "ACME-7" }], tickets, SITE), {});
});

test("badge fields: short, one url per ticket, tone by category", () => {
  const items = badges([
    agent("a", "ACME-1645"), agent("b", "ACME-1645 #2"), agent("c", "ACME-12"), agent("d", "ACME-7"), agent("e", "ACME-9"),
  ], tickets, SITE);
  assert.equal(items.a.short, "ACME-1645 In Progress");
  assert.equal(items.a.url, "https://example.atlassian.net/browse/ACME-1645");
  assert.equal(items.b.url, items.a.url, "every Claude on one ticket shares the url (the grid groups by it)");
  assert.equal(items.a.tone, "bright");
  assert.equal(items.c.tone, "bright", "To Do is work in flight");
  assert.equal(items.d.tone, "bright", "Review is in Jira's In Progress category");
  assert.equal(items.e.tone, "dim", "Done");
  const unknown = badges([agent("x", "ACME-5")], { "ACME-5": { status: "?", category: null, summary: "" } }, SITE);
  assert.equal(unknown.x.tone, "dim", "no category");
  assert.equal(shortOf("ACME-1", "x".repeat(60)).length, 40, "a long status is cut, not dropped");
});

test("with no jira_url, badges and rows carry no link", () => {
  const b = badges([agent("a", "ACME-7")], tickets, "");
  assert.deepEqual(b.a, { text: "Review · S", short: "ACME-7 Review", tone: "bright" });
  assert.deepEqual(rows({ "ACME-3": { status: "Review", summary: "" } }, [], ""), [{ id: "ACME-3", text: "ACME-3 · Review" }]);
});

test("unattended tickets become rows, at most MINE_LIMIT", () => {
  const mine = { "ACME-3": { status: "Review", summary: "Third" }, "ACME-1645": { status: "In Progress", summary: "x" }, "ACME-2": { status: "In Progress", summary: "" } };
  assert.deepEqual(rows(mine, [agent("a", "ACME-1645")], SITE), [
    { id: "ACME-3", text: "ACME-3 · Review", sub: "Third", url: "https://example.atlassian.net/browse/ACME-3" },
    { id: "ACME-2", text: "ACME-2 · In Progress", url: "https://example.atlassian.net/browse/ACME-2" },
  ]);
  const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`ACME-${i + 1}`, { status: "To Do", summary: "" }]));
  assert.equal(rows(many, [], SITE).length, MINE_LIMIT);
});

test("what kit-jira publishes passes the core's checks, under the core's key names", () => {
  assert.equal(KEYS.badges, ADDON_KEYS.badges);
  assert.equal(KEYS.rows, ADDON_KEYS.rows);
  assert.ok(!Object.values(KEYS).includes(ADDON_KEYS.buttons), "kit-jira never writes buttons");
  assert.ok(!Object.values(KEYS).includes(ADDON_KEYS.press), "nor presses");
  const at = 1000;
  const b = badges([agent("a", "ACME-1645", { pr: openPr }), agent("b", "ACME-7")], tickets, SITE);
  const r = rows({ "ACME-3": { status: "Review", summary: "Third" } }, [], SITE);
  const got = readAddon({ badges: envelope(b, at), rows: envelope(r, at) }, at);
  assert.deepEqual(got.badges, b);
  assert.deepEqual(got.rows, r);
  assert.deepEqual(feed({ x: 1 }, { a: "ACME-1645" }, b, r, at), { at, tickets: { x: 1 }, keys: { a: "ACME-1645" }, badges: b, rows: r });
});

test("config: the defaults, and kit-jira does nothing unless addons lists it", () => {
  assert.deepEqual(DEFAULTS, {
    jira_url: "", acli: "", jira_projects: [], jira_mine: false,
    jira_mine_jql: 'assignee = currentUser() AND statusCategory = "In Progress" ORDER BY updated DESC', jira_publish: true,
  });
  for (const text of [null, "", "{", "[]", '{"addons": []}', '{"addons": "kit-jira"}', '{"addons": ["kit-other"]}']) {
    assert.equal(readJiraConfig(text).listed, false, String(text));
  }
  const r = readJiraConfig('{"addons": ["kit-jira"]}');
  assert.equal(r.listed, true);
  assert.deepEqual(r.cfg, DEFAULTS);
  assert.deepEqual(r.problems, []);
  r.cfg.jira_projects.push("X");
  assert.deepEqual(DEFAULTS.jira_projects, [], "the defaults are never shared");
});

test("config: good values win, bad ones keep the default and say so", () => {
  const good = readJiraConfig(JSON.stringify({
    addons: ["kit-jira"], jira_url: "https://acme.atlassian.net/", acli: " /x/acli ", jira_projects: ["acme"], jira_mine: true,
    jira_mine_jql: "project = ACME", jira_publish: false,
  }));
  assert.deepEqual(good.cfg, {
    jira_url: "https://acme.atlassian.net", acli: "/x/acli", jira_projects: ["ACME"], jira_mine: true, jira_mine_jql: "project = ACME", jira_publish: false,
  });
  const bad = readJiraConfig(JSON.stringify({ addons: ["kit-jira"], jira_url: "acme", jira_projects: "ACME", jira_mine: "yes", jira_mine_jql: " ", jira_publish: 0, acli: 3 }));
  assert.deepEqual(bad.cfg, DEFAULTS);
  assert.equal(bad.problems.length, 2);
  assert.match(bad.problems[0], /jira_url/);
  assert.match(bad.problems[1], /jira_projects/);
});

test("acli: the config's path alone, else Homebrew's, /usr/local's, then PATH", () => {
  assert.deepEqual(acliPlaces({ acli: "/x/acli" }), ["/x/acli"]);
  assert.deepEqual(acliPlaces({ acli: "" }), ["/opt/homebrew/bin/acli", "/usr/local/bin/acli", "acli"]);
  assert.notEqual(acliPlaces({ acli: "" }), ACLI_PLACES, "a copy");
});

test("publish: on a change, else at least every REPUBLISH_MS, always well inside 60 s", () => {
  assert.ok(REPUBLISH_MS <= 60_000);
  assert.equal(publishDue("s", null, 0), true, "first time");
  assert.equal(publishDue("s", { sig: "s", at: 0 }, REPUBLISH_MS - 1), false);
  assert.equal(publishDue("s", { sig: "s", at: 0 }, REPUBLISH_MS), true);
  assert.equal(publishDue("t", { sig: "s", at: 0 }, 1), true);
});

test("search: on a new key set or once a minute; never with no keys, busy, or acli off", () => {
  const last = { sig: "ACME-1", at: 0, busy: false, off: false };
  assert.equal(searchDue(["ACME-1"], last, 1), false);
  assert.equal(searchDue(["ACME-1"], last, SEARCH_MS), true);
  assert.equal(searchDue(["ACME-1", "ACME-2"], last, 1), true);
  assert.equal(searchDue([], { ...last, sig: "" }, SEARCH_MS), false);
  assert.equal(searchDue(["ACME-2"], { ...last, busy: true }, SEARCH_MS), false);
  assert.equal(searchDue(["ACME-2"], { ...last, off: true }, SEARCH_MS), false);
});

test("my tickets: at once, then every 5 minutes", () => {
  assert.equal(mineDue({ at: null, busy: false, off: false }, 0), true);
  assert.equal(mineDue({ at: 0, busy: false, off: false }, MINE_MS - 1), false);
  assert.equal(mineDue({ at: 0, busy: false, off: false }, MINE_MS), true);
  assert.equal(mineDue({ at: null, busy: false, off: true }, 0), false);
});

test("model agents: only a real list of addressed agents", () => {
  assert.deepEqual(modelAgents(null), []);
  assert.deepEqual(modelAgents({ agents: "x" }), []);
  assert.deepEqual(modelAgents({ agents: [{ address: "a" }, null, { name: "no address" }] }), [{ address: "a" }]);
});

test("only a program-not-found rejection counts as acli missing", () => {
  assert.equal(isMissing(new Error("spawn /x/acli ENOENT")), true);
  assert.equal(isMissing(Object.assign(new Error("spawn failed"), { code: "ENOENT" })), true);
  assert.equal(isMissing("No such file or directory (os error 2)"), true);
  assert.equal(isMissing(new Error("timed out after 30000 ms")), false);
  assert.equal(isMissing(new Error("machine unreachable")), false);
  assert.equal(isMissing(null), false);
});

test("badgeSig moves only with what badges are built from", () => {
  const a = [{ address: "a", name: "ACME-1", rawHint: "h", pr: null, tool: "Bash", ctx_left: 40 }];
  assert.equal(badgeSig(a), badgeSig([{ ...a[0], tool: "Read", ctx_left: 39 }]));
  assert.notEqual(badgeSig(a), badgeSig([{ ...a[0], name: "ACME-2" }]));
  assert.notEqual(badgeSig(a), badgeSig([{ ...a[0], pr: { number: 1 } }]));
});

test("every kit-jira config key is in config.example.json and the README Config table", () => {
  const ex = JSON.parse(readFileSync(join(ROOT, "config.example.json"), "utf8"));
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  for (const [k, v] of Object.entries(DEFAULTS)) {
    assert.deepEqual(ex[k], v, `config.example.json: ${k}`);
    assert.match(readme, new RegExp(`\\| \`${k}\` \\|`), `README: ${k}`);
  }
});
