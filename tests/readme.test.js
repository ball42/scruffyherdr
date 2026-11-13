import { test } from "node:test";
import assert from "node:assert/strict";
import { README_MOD, README_PENDING_MS, hasReadmeTab, pickReadme, readmeMoves, readmeNeeds, spaceFolder } from "../herdr/mods/herdr-signals/readme.js";

const space = (id, tabs, extra = {}) => ({
  id, folder: `/p/${id}`, machine: null,
  tabs: tabs.map((t, i) => ({ id: t, index: i + 1 })), ...extra,
});
const term = (tab, cwd, terminal = "t1") => ({ pane: `p-${tab}-${cwd}`, tab, terminal, cwd });
const mod = (tab, name = README_MOD) => ({ pane: `m-${tab}`, tab, terminal: null, mod: name, cwd: null });

test("spaceFolder takes the first terminal's live folder in tab order", () => {
  const s = space("a", ["t1", "t2"]);
  const panes = [term("t2", "/later"), mod("t1"), term("t1", "/first")];
  assert.equal(spaceFolder(s, panes), "/first");
});

test("spaceFolder falls back to the space's folder with no terminal", () => {
  assert.equal(spaceFolder(space("a", ["t1"]), [mod("t1")]), "/p/a");
  assert.equal(spaceFolder(space("a", ["t1"], { folder: "" }), []), null);
});

test("spaceFolder ignores other spaces' panes", () => {
  assert.equal(spaceFolder(space("a", ["t1"]), [term("zz", "/other")]), "/p/a");
});

test("hasReadmeTab looks for a kit-readme pane in the space's tabs", () => {
  const s = space("a", ["t1", "t2"]);
  assert.equal(hasReadmeTab(s, [mod("t2")]), true);
  assert.equal(hasReadmeTab(s, [mod("t2", "files")]), false);
  assert.equal(hasReadmeTab(s, [mod("zz")]), false);
});

test("readmeNeeds skips spaces with a README tab, remote spaces and recent asks", () => {
  const spaces = [
    space("has", ["h1"]),
    space("remote", ["r1"], { machine: "vps" }),
    space("asked", ["a1"]),
    space("stale", ["s1"]),
    space("new", ["n1"]),
  ];
  const panes = [mod("h1"), term("r1", "/r"), term("a1", "/a"), term("s1", "/s"), term("n1", "/n")];
  const now = 100000;
  const pending = { asked: now - 1000, stale: now - README_PENDING_MS };
  const got = readmeNeeds(spaces, panes, pending, now).map((n) => [n.space.id, n.folder]);
  assert.deepEqual(got, [["stale", "/s"], ["new", "/n"]]);
});

test("pickReadme prefers README.md, then any readme spelling", () => {
  assert.equal(pickReadme(["readme.txt", "README.md"]), "README.md");
  assert.equal(pickReadme(["src", "Readme.markdown"]), "Readme.markdown");
  assert.equal(pickReadme(["README"]), "README");
  assert.equal(pickReadme(["readme.rst", "src"]), null);
});

test("readmeMoves finds README tabs that aren't first, once per pending window", () => {
  const spaces = [
    space("first", ["f1", "f2"]),
    space("second", ["s1", "s2"]),
    space("recent", ["r1", "r2"]),
    space("remote", ["x1", "x2"], { machine: "vps" }),
    space("none", ["n1"]),
  ];
  const panes = [mod("f1"), mod("s2"), mod("r2"), mod("x2"), term("n1", "/n")];
  const now = 100000;
  const got = readmeMoves(spaces, panes, { r2: now - 1000 }, now);
  assert.deepEqual(got, [{ tab: "s2", space: "second" }]);
  assert.deepEqual(readmeMoves(spaces, panes, { r2: now - README_PENDING_MS }, now).map((m) => m.tab), ["s2", "r2"]);
});
