import { test } from "node:test";
import assert from "node:assert/strict";
import { applyReads, changedFiles, homeBackground, nameKey, parseStamps, stampDiff, titleKey } from "../herdr/mods/herdr-signals/folder.js";

const DIR = "/home/x/.config/herdr-kit/names";

test("folder: a watch batch reads only the names files it names", () => {
  assert.deepEqual(changedFiles([`${DIR}/t1.json`, `${DIR}/t1.json`, `${DIR}/t2.json`], DIR), ["t1.json", "t2.json"]);
  assert.deepEqual(changedFiles([`${DIR}/t1.json.tmp`, `${DIR}/.DS_Store`, "/elsewhere/t3.json"], DIR), []);
});

test("folder: the folder itself, or an empty batch, means reread everything", () => {
  assert.equal(changedFiles([DIR, `${DIR}/t1.json`], DIR), null);
  assert.equal(changedFiles([`${DIR}/`], `${DIR}/`), null);
  assert.equal(changedFiles([], DIR), null);
  assert.equal(changedFiles(undefined, DIR), null);
});

test("folder: stamps come from stat, names files only", () => {
  const out = parseStamps(`1794267210.479619033 416 ${DIR}/t10g.json\n1794103077.2 479 ${DIR}/t11.json\n17 3 ${DIR}/notes.txt\n\n`);
  assert.deepEqual(out, { "t10g.json": "1794267210.479619033 416", "t11.json": "1794103077.2 479" });
});

test("folder: the safety net reads only new or changed files and drops gone ones", () => {
  const prev = { "a.json": "1 10", "b.json": "2 20", "c.json": "3 30" };
  const next = { "a.json": "1 10", "b.json": "2.5 20", "d.json": "4 40" };
  assert.deepEqual(stampDiff(prev, next), { read: ["b.json", "d.json"], gone: ["c.json"] });
  assert.deepEqual(stampDiff(next, next), { read: [], gone: [] });
});

test("folder: a burst of 10 writes to 2 files reads those 2, not the folder", () => {
  const batch = Array.from({ length: 10 }, (_, i) => `${DIR}/t${i % 2}.json`);
  assert.deepEqual(changedFiles(batch, DIR), ["t0.json", "t1.json"]);
});

test("folder: reads replace, removals drop, junk keeps the old entry", () => {
  const files = { a: { name: "old" }, b: { name: "b" }, c: { name: "c" } };
  const out = applyReads(files, [["a.json", { name: "new" }], ["b.json", null], ["c.json", undefined], ["d.json", { name: "d" }]]);
  assert.deepEqual(out, { a: { name: "new" }, c: { name: "c" }, d: { name: "d" } });
  assert.deepEqual(files.a, { name: "old" }, "does not mutate");
  assert.equal(nameKey("t1.json"), "t1");
  assert.equal(nameKey("t1.json.tmp"), null);
});

test("folder: ctx pruning deletes files untouched for a week, keeps recent ones and subfolders", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const { CTX_KEEP_MIN, pruneCtxArgs } = await import("../herdr/mods/herdr-signals/folder.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-"));
  const ago = (min) => new Date(Date.now() - min * 60000);
  const put = (name, min) => { const f = path.join(dir, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, "42"); fs.utimesSync(f, ago(min), ago(min)); };
  put("t1", CTX_KEEP_MIN + 60);
  put("t2", 60);
  put("sub/t3", CTX_KEEP_MIN + 60);
  execFileSync("find", pruneCtxArgs(dir));
  assert.deepEqual(fs.readdirSync(dir).sort(), ["sub", "t2"]);
  assert.deepEqual(fs.readdirSync(path.join(dir, "sub")), ["t3"]);
});

const ag = (address, title) => ({ address, title });

test("homeBackground: a background session's file goes to the terminal showing its title", () => {
  const bg = { session_id: "s1", hint: "Project spaces ticket expedition", card: "decide" };
  const files = { t5q: { session_id: "old" }, "bg-s1": bg };
  const out = homeBackground([ag("t2cc", "✳ Project spaces ticket expedition"), ag("t9", "other")], files);
  assert.equal(out.t2cc, bg);
  assert.equal(out.t9, undefined);
  assert.equal(out.t5q, files.t5q, "other files stay as they were");
  assert.equal(files.t2cc, undefined, "the input isn't changed");
});

test("homeBackground: a /rename name matches too; an agent's own matching file wins", () => {
  const bg = { name: "Fleet Boss", hint: "x" };
  assert.equal(homeBackground([ag("t1", "Fleet Boss")], { "bg-s1": bg }).t1, bg);
  const own = { hint: "Fleet Boss" };
  assert.equal(homeBackground([ag("t1", "Fleet Boss")], { t1: own, "bg-s1": bg }).t1, own);
  // An own file from an earlier session, with another title, gives way.
  assert.equal(homeBackground([ag("t1", "Fleet Boss")], { t1: { hint: "yesterday" }, "bg-s1": bg }).t1, bg);
});

test("homeBackground: only a one-to-one match moves", () => {
  const a = { hint: "Same" }, b = { hint: "same " };
  assert.equal(homeBackground([ag("t1", "Same")], { "bg-a": a, "bg-b": b }).t1, undefined, "two files match one terminal");
  assert.deepEqual(Object.keys(homeBackground([ag("t1", "Same"), ag("t2", "Same")], { "bg-a": a })).sort(), ["bg-a"], "two terminals match one file");
  assert.equal(homeBackground([ag("t1", "")], { "bg-a": { hint: "" } }).t1, undefined, "no title, no match");
  const files = { t1: {} };
  assert.equal(homeBackground([ag("t1", "x")], files), files, "no background files: unchanged");
});

test("titleKey: spinner glyphs, spaces and case don't count", () => {
  assert.equal(titleKey("⠂  Fleet   Boss "), "fleet boss");
  assert.equal(titleKey("✳ 33 rounds"), "33 rounds");
  assert.equal(titleKey(null), "");
});
