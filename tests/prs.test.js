import { test } from "node:test";
import assert from "node:assert/strict";
import { prRef, parsePr, prMark } from "../herdr/mods/herdr-signals/prs.js";

test("PR ref comes from the name's #number, else a non-trunk branch", () => {
  assert.equal(prRef("ACME-2055 #1645", "main"), "1645");
  assert.equal(prRef("ACME-2312", "fix/ACME-2312-retry"), "fix/ACME-2312-retry");
  assert.equal(prRef("ACME-2312", "main"), null);
  assert.equal(prRef("ACME-2312", null), null);
});

test("parses gh json and rolls up checks", () => {
  const pr = (runs, extra = {}) => JSON.stringify({ number: 7, state: "OPEN", isDraft: false, reviewDecision: "", statusCheckRollup: runs, ...extra });
  assert.equal(parsePr(pr([{ status: "COMPLETED", conclusion: "SUCCESS" }, { status: "COMPLETED", conclusion: "SKIPPED" }])).checks, "pass");
  assert.equal(parsePr(pr([{ status: "IN_PROGRESS", conclusion: null }])).checks, "pending");
  assert.equal(parsePr(pr([{ status: "IN_PROGRESS" }, { status: "COMPLETED", conclusion: "FAILURE" }])).checks, "fail");
  assert.equal(parsePr(pr([{ state: "PENDING" }])).checks, "pending");
  assert.equal(parsePr("no pull requests found"), null);
});

test("marks read by shape", () => {
  const base = { number: 7, state: "OPEN", draft: false, review: null, checks: "pass" };
  assert.equal(prMark(base), "#7 ●");
  assert.equal(prMark({ ...base, checks: "fail", draft: true }), "#7 ✕ draft");
  assert.equal(prMark({ ...base, review: "APPROVED" }), "#7 ● approved");
  assert.equal(prMark({ ...base, state: "MERGED" }), "#7 merged");
});

const { parsePrBatch, prQuery, repoOf } = await import("../herdr/mods/herdr-signals/prs.js");

test("prs batch: origin URLs give owner and name", () => {
  assert.deepEqual(repoOf("https://github.com/octo/herdr-kit.git"), { owner: "octo", name: "herdr-kit" });
  assert.deepEqual(repoOf("git@github.com:octo/web-app.git\n"), { owner: "octo", name: "web-app" });
  assert.deepEqual(repoOf("ssh://git@github.com/o/r"), { owner: "o", name: "r" });
  assert.equal(repoOf("https://gitlab.com/o/r.git"), null);
  assert.equal(repoOf(""), null);
});

test("prs batch: one query, an alias per repo and per ref", () => {
  const { query, aliases } = prQuery([
    { key: "/a|46", owner: "octo", name: "herdr-kit", ref: "46" },
    { key: "/b|kit/x", owner: "octo", name: "web-app", ref: "kit/x" },
    { key: "/c|7", owner: "octo", name: "herdr-kit", ref: "7" },
  ]);
  assert.deepEqual(aliases, { "/a|46": ["r0", "p0"], "/b|kit/x": ["r1", "p1"], "/c|7": ["r0", "p2"] });
  assert.equal(query.match(/repository\(/g).length, 2, "herdr-kit is asked once");
  assert.match(query, /p0: pullRequest\(number: 46\)/);
  assert.match(query, /p1: pullRequests\(headRefName: "kit\/x"/);
  assert.equal(prQuery([]).query, null);
});

test("prs batch: branch names are quoted, so a quote can't break the query", () => {
  const { query } = prQuery([{ key: "k", owner: "o", name: "r", ref: 'a"b' }]);
  assert.match(query, /headRefName: "a\\"b"/);
});

test("prs batch: parses numbers and branches into parsePr's shape, open PR first", () => {
  const node = (number, state, rollup, extra = {}) => ({ number, state, isDraft: false, reviewDecision: null, commits: { nodes: [{ commit: { statusCheckRollup: rollup && { state: rollup } } }] }, ...extra });
  const stdout = JSON.stringify({ data: {
    r0: { p0: node(46, "MERGED", null), p2: null },
    r1: { p1: { nodes: [node(9, "CLOSED", "FAILURE"), node(8, "OPEN", "PENDING", { isDraft: true, reviewDecision: "APPROVED" })] } },
  } });
  const out = parsePrBatch(stdout, { a: ["r0", "p0"], b: ["r1", "p1"], c: ["r0", "p2"], d: ["r9", "p9"] });
  assert.deepEqual(out, {
    a: { number: 46, url: null, state: "MERGED", draft: false, review: null, checks: "pass" },
    b: { number: 8, url: null, state: "OPEN", draft: true, review: "APPROVED", checks: "pending" },
  });
  const failing = parsePrBatch(JSON.stringify({ data: { r0: { p0: node(5, "OPEN", "ERROR") } } }), { k: ["r0", "p0"] });
  assert.equal(failing.k.checks, "fail");
  assert.deepEqual(parsePrBatch("not json", { a: ["r0", "p0"] }), {});
  const none = parsePrBatch(JSON.stringify({ data: { r0: { p0: { nodes: [] } } } }), { a: ["r0", "p0"] });
  assert.deepEqual(none, {}, "a branch with no PR has no entry");
});

test("parsePr keeps the url the rail's PR link opens", () => {
  const url = "https://github.com/o/r/pull/7";
  assert.equal(parsePr(JSON.stringify({ number: 7, url, state: "OPEN" })).url, url);
  assert.equal(parsePr(JSON.stringify({ number: 7, state: "OPEN" })).url, null);
});

test("the graphql batch asks for and keeps the url", () => {
  const url = "https://github.com/o/r/pull/9";
  const { query } = prQuery([{ key: "k", ref: "9", owner: "o", name: "r" }]);
  assert.match(query, /\burl\b/);
  assert.equal(parsePrBatch(JSON.stringify({ data: { r0: { p0: { number: 9, url, state: "OPEN" } } } }), { k: ["r0", "p0"] }).k.url, url);
});
