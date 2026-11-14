// kit-jira's main.js under a stubbed Herdr: what it publishes and when, that
// it writes nothing unless `addons` lists it, a missing acli, and failures.
import { host, fakeCx, resetHost } from "./support/herdr-stub.js";
import { test } from "node:test";
import assert from "node:assert/strict";

const { default: KitJira } = await import("../herdr/mods/kit-jira/main.js");
const { readAddon } = await import("../herdr/mods/herdr-signals/addons.js");

const realNow = Date.now;
Date.now = () => host.now;
test.after(() => { Date.now = realNow; });

const CFG = "/home/test/.config/herdr-kit/config.json";
const SITE = "https://example.atlassian.net";
const SEARCH = JSON.stringify([{ key: "ACME-1645", fields: { summary: "Retry the upload", status: { name: "In Progress", statusCategory: { key: "indeterminate" } } } }]);
const MINE = JSON.stringify([{ key: "ACME-3", fields: { summary: "Third", status: { name: "Review", statusCategory: { key: "indeterminate" } } } }]);
const PR = { number: 1645, url: "https://github.com/o/r/pull/1645", state: "OPEN", draft: false, review: null, checks: "pass" };
const BASE = { addons: ["kit-jira"], acli: "/x/acli", jira_url: SITE };
const searches = () => host.execs.filter(([, a]) => a[2] === "search" && a[4].startsWith("key in"));
const mineCalls = () => host.execs.filter(([, a]) => a[2] === "search" && !a[4].startsWith("key in"));

function acliOk(cmd, args) {
  if (args[2] === "search") return { code: 0, stdout: args[4].startsWith("key in") ? SEARCH : MINE, stderr: "" };
  return { code: 0, stdout: "", stderr: "" };
}

async function start({ exec = async (c, a) => acliOk(c, a), cfg = BASE } = {}) {
  resetHost();
  host.exec = exec;
  if (cfg !== null) host.files[CFG] = typeof cfg === "string" ? cfg : JSON.stringify(cfg);
  host.shared["herdr-kit"] = { agents: [{ address: "t1", name: "ACME-1645 #1645", rawHint: "hint", pr: PR, session: "s1", status: "working" }] };
  const cx = fakeCx();
  const view = new KitJira();
  const started = host.now;
  view.init({}, cx);
  await cx.settle();
  return { cx, view, started };
}
const last = (key) => host.shared[key];
const read = (since) => readAddon({ badges: last("kit.addon.badges"), rows: last("kit.addon.rows") }, since);

async function quietly(fn) {
  const logs = [];
  const log = console.log;
  console.log = (m) => logs.push(String(m));
  try {
    await fn(logs);
  } finally {
    console.log = log;
  }
}

test("unlisted in addons, kit-jira writes no shared key and runs no acli", async () => {
  for (const cfg of [null, "{", { acli: "/x/acli", jira_url: SITE }, { addons: ["kit-other"], acli: "/x/acli" }]) {
    const { cx, view } = await start({ cfg });
    await cx.advance(10 * 60_000);
    view.render(cx);
    await cx.settle();
    assert.deepEqual(host.sets, [], JSON.stringify(cfg));
    assert.deepEqual(host.execs, [], JSON.stringify(cfg));
  }
});

test("listed: empty values first, then badges inside 5 s; my tickets stay off by default", async () => {
  const { cx, started } = await start();
  assert.deepEqual(host.sets.map(([k]) => k).sort(), ["kit.addon.badges", "kit.addon.rows", "kit.jira"]);
  assert.deepEqual(last("kit.addon.badges"), { at: started, items: {} });
  assert.deepEqual(last("kit.addon.rows"), { at: started, items: [] });
  await cx.advance(2000);
  await cx.advance(2000);
  const got = read(started);
  assert.deepEqual(got.badges.t1, {
    text: "In Progress · #1645 ● · Retry the upload", short: "ACME-1645 In Progress", url: `${SITE}/browse/ACME-1645`, tone: "bright",
  });
  assert.deepEqual(got.rows, []);
  assert.ok(last("kit.addon.badges").at - started <= 5000);
  assert.equal(mineCalls().length, 0, "no my-tickets search unless jira_mine is on");
  assert.ok(!host.sets.some(([k]) => k === "kit.addon.buttons" || k === "kit.addon.press"), "never buttons or presses");
});

test("jira_mine on: the config's JQL, as rows for tickets no Claude is on", async () => {
  const { cx, started } = await start({ cfg: { ...BASE, jira_mine: true, jira_mine_jql: "assignee = currentUser() AND project = ACME" } });
  await cx.advance(4000);
  assert.equal(mineCalls()[0][1][4], "assignee = currentUser() AND project = ACME");
  assert.deepEqual(read(started).rows, [{ id: "ACME-3", text: "ACME-3 · Review", sub: "Third", url: `${SITE}/browse/ACME-3` }]);
  await cx.advance(5 * 60_000);
  assert.equal(mineCalls().length, 2, "every 5 minutes");
});

test("every key is republished with a fresh stamp well inside 60 s", async () => {
  const { cx } = await start();
  await cx.advance(4000);
  const before = host.now;
  await cx.advance(20_000);
  for (const k of ["kit.addon.badges", "kit.addon.rows", "kit.jira"]) assert.ok(last(k).at > before, `${k} republished`);
});

test("badges follow the current model, not one read earlier", async () => {
  const { cx, view } = await start();
  await cx.advance(4000);
  host.shared["herdr-kit"] = { agents: [{ address: "t9", name: "other work", rawHint: null, pr: null }] };
  view.render(cx);
  await cx.settle();
  assert.deepEqual(last("kit.addon.badges").items, {}, "the old address's badge is gone at once");
});

test("jira_projects: a key outside the list is never searched", async () => {
  const { cx } = await start({ cfg: { ...BASE, jira_projects: ["OPS"] } });
  await cx.advance(10_000);
  assert.equal(searches().length, 0);
  host.shared["herdr-kit"].agents.push({ address: "t2", name: "OPS-4 x", rawHint: null, pr: null });
  await cx.advance(2000);
  assert.deepEqual(searches().map(([, a]) => a[4]), ["key in (OPS-4)"]);
});

test("jira_publish off: only kit.jira is written, carrying the tickets, badges and rows", async () => {
  const { cx, view } = await start({ cfg: { ...BASE, jira_publish: false, jira_mine: true } });
  await cx.advance(4000);
  view.render(cx);
  await cx.settle();
  await cx.advance(60_000);
  assert.deepEqual([...new Set(host.sets.map(([k]) => k))], ["kit.jira"]);
  const f = last("kit.jira");
  assert.deepEqual(f.tickets, { "ACME-1645": { status: "In Progress", category: "indeterminate", summary: "Retry the upload" } });
  assert.deepEqual(f.keys, { t1: "ACME-1645" });
  assert.equal(f.badges.t1.short, "ACME-1645 In Progress");
  assert.deepEqual(f.rows.map((r) => r.id), ["ACME-3"]);
});

test("no acli path set: Homebrew's, then /usr/local's, then PATH's; all missing turns it off, logged once", async () => {
  await quietly(async (logs) => {
    const { cx, started } = await start({
      cfg: { addons: ["kit-jira"], jira_mine: true },
      exec: async () => { throw new Error("No such file or directory (os error 2)"); },
    });
    await cx.advance(20_000);
    const tried = [...new Set(host.execs.map(([c]) => c))];
    assert.deepEqual(tried, ["/opt/homebrew/bin/acli", "/usr/local/bin/acli", "acli"]);
    const calls = host.execs.length;
    await cx.advance(10 * 60_000);
    assert.equal(host.execs.length, calls, "no more acli calls");
    assert.equal(logs.filter((m) => m.includes("acli not found")).length, 1, "logged once");
    assert.deepEqual(read(started), { badges: {}, rows: [], buttons: [] });
  });
});

test("the first place that runs is kept", async () => {
  const { cx, started } = await start({
    cfg: { addons: ["kit-jira"], jira_url: SITE },
    exec: async (c, a) => { if (c === "/opt/homebrew/bin/acli") throw new Error("spawn ENOENT"); return acliOk(c, a); },
  });
  await cx.advance(8000);
  assert.equal(read(started).badges.t1.short, "ACME-1645 In Progress");
  await cx.advance(5 * 60_000);
  assert.equal(host.execs.filter(([c]) => c === "/opt/homebrew/bin/acli").length, 1);
  assert.ok(host.execs.filter(([c]) => c === "/usr/local/bin/acli").length >= 5);
});

test("a configured acli that is missing turns Jira off at once", async () => {
  await quietly(async (logs) => {
    const { cx } = await start({ exec: async () => { throw new Error("spawn /x/acli ENOENT"); } });
    await cx.advance(10 * 60_000);
    assert.deepEqual([...new Set(host.execs.map(([c]) => c))], ["/x/acli"]);
    assert.equal(host.execs.length, 1);
    assert.equal(logs.filter((m) => m.includes("acli not found (tried /x/acli)")).length, 1);
  });
});

test("a timeout is not a missing acli: logged once per change of error, retried at the cadence", async () => {
  await quietly(async (logs) => {
    let err = "timed out after 30000 ms";
    const { cx } = await start({ exec: async (c, a) => { if (a[2] === "search" && err) throw new Error(err); return acliOk(c, a); } });
    await cx.advance(2000);
    assert.equal(searches().length, 1);
    await cx.advance(60_000);
    assert.equal(searches().length, 2, "retried a minute later");
    assert.equal(logs.filter((m) => m.includes("search failed") && m.includes("timed out")).length, 1, "the same error logged once");
    err = "machine unreachable";
    await cx.advance(60_000);
    assert.equal(logs.filter((m) => m.includes("search failed") && m.includes("unreachable")).length, 1, "a new error is logged");
    assert.equal(logs.filter((m) => m.includes("not found")).length, 0, "acli is not turned off");
    err = null;
    await cx.advance(62_000);
    assert.equal(last("kit.addon.badges").items.t1.short, "ACME-1645 In Progress", "badges come back");
  });
});

test("one unknown key fails the batch: each key is searched alone, and the good ones still badge", async () => {
  await quietly(async (logs) => {
    const { cx, started } = await start({
      exec: async (c, a) => {
        if (a[2] === "search" && a[4].includes("UTF-8")) return { code: 1, stdout: "", stderr: "The value 'UTF-8' does not exist for the field 'key'." };
        return acliOk(c, a);
      },
    });
    host.shared["herdr-kit"].agents.push({ address: "t2", name: "UTF-8 notes", rawHint: null, pr: null });
    await cx.advance(4000);
    assert.equal(read(started).badges.t1.short, "ACME-1645 In Progress");
    assert.equal(read(started).badges.t2, undefined);
    assert.deepEqual(searches().map(([, a]) => a[4]), ["key in (ACME-1645,UTF-8)", "key in (ACME-1645)", "key in (UTF-8)"]);
    await cx.advance(120_000);
    assert.equal(logs.filter((m) => m.includes("no ticket for UTF-8") && m.includes("jira_projects")).length, 1, "logged once");
  });
});

test("a failed search keeps the last tickets", async () => {
  let fail = false;
  const { cx } = await start({ exec: async (c, a) => (fail && a[2] === "search" ? { code: 1, stdout: "", stderr: "unauthorized" } : acliOk(c, a)) });
  await cx.advance(4000);
  fail = true;
  await quietly(async () => cx.advance(120_000));
  assert.equal(last("kit.addon.badges").items.t1.short, "ACME-1645 In Progress");
});

test("a failed my-tickets search is retried in a minute, then every 5 minutes", async () => {
  let fail = true;
  await quietly(async () => {
    const { cx } = await start({
      cfg: { ...BASE, jira_mine: true },
      exec: async (c, a) => (fail && a[2] === "search" && !a[4].startsWith("key in") ? { code: 1, stdout: "", stderr: "offline" } : acliOk(c, a)),
    });
    await cx.advance(2000);
    assert.equal(mineCalls().length, 1);
    fail = false;
    await cx.advance(62_000);
    assert.equal(mineCalls().length, 2, "retried a minute later");
    await cx.advance(4 * 60_000);
    assert.equal(mineCalls().length, 2, "then on the 5-minute cadence");
  });
});

test("a non-zero exit is logged once and retried", async () => {
  await quietly(async (logs) => {
    const { cx } = await start({ exec: async (c, a) => (a[2] === "search" ? { code: 1, stdout: "", stderr: "unauthorized" } : acliOk(c, a)) });
    await cx.advance(2000 + 120_000);
    assert.ok(searches().length >= 3, "keeps trying");
    assert.equal(logs.filter((m) => m.includes("unauthorized") && m.includes("search")).length, 1);
  });
});

test("a bad jira_url is logged and badges go out without a link", async () => {
  await quietly(async (logs) => {
    const { cx, started } = await start({ cfg: { ...BASE, jira_url: "example.atlassian.net" } });
    await cx.advance(4000);
    assert.equal(logs.filter((m) => m.includes("jira_url")).length, 1);
    assert.equal(read(started).badges.t1.url, undefined);
    assert.equal(read(started).badges.t1.short, "ACME-1645 In Progress");
  });
});
