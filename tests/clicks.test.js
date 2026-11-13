import { test } from "node:test";
import assert from "node:assert/strict";
import { readClicks, keepClicks, missingIds } from "../herdr/mods/herdr-signals/clicks.js";

const EMPTY = { nodes: {}, theme: null };
const tree = () => ({ id: "root", children: [{ id: "rail", size: { px: 100 } }, { id: "main", children: [{ id: "sidebar" }] }] });

test("readClicks reads nodes and ignores file", () => {
  assert.deepEqual(readClicks('{"nodes":{"rail":{"size":{"px":336}}},"file":{}}'), { nodes: { rail: { size: { px: 336 } } }, theme: null });
});

test("readClicks reads the theme pick", () => {
  const pair = { light: "naboo-day", dark: "endor-night" };
  assert.deepEqual(readClicks(JSON.stringify({ theme: pair })).theme, pair);
});

test("readClicks never throws on bad input", () => {
  for (const bad of [null, "", "{", '{"nodes":3}']) assert.deepEqual(readClicks(bad), EMPTY);
  assert.deepEqual(readClicks('{"nodes":{"rail":7}}'), EMPTY);
});

test("keepClicks carries size onto the matching node without touching the input", () => {
  const t = tree();
  const out = keepClicks(t, { rail: { size: { px: 336 } }, gone: { size: { px: 9 } } });
  assert.deepEqual(out.children[0].size, { px: 336 });
  assert.deepEqual(t, tree());
  assert.equal(JSON.stringify(out).includes("gone"), false);
});

test("keepClicks copies hidden too", () => {
  const out = keepClicks(tree(), { sidebar: { hidden: true } });
  assert.equal(out.children[1].children[0].hidden, true);
});

test("missingIds lists click ids the tree lacks", () => {
  assert.deepEqual(missingIds(tree(), { rail: {}, gone: {} }), ["gone"]);
});
