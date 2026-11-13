import { test } from "node:test";
import assert from "node:assert/strict";
import { LAYOUT_NOTE, canonical, layoutChanged } from "../herdr/mods/herdr-signals/layout.js";

const main = '{"id":"root","type":"column","children":[{"id":"status","type":"block"}]}';

test("layout: same content, other key order or spacing, is not a change", () => {
  assert.equal(layoutChanged(main, canonical(JSON.parse(main))), false);
  assert.equal(layoutChanged('{ "type": "column", "children": [{"type":"block","id":"status"}], "id": "root" }', main), false);
});

test("layout: a real change is flagged", () => {
  assert.equal(layoutChanged('{"id":"root","type":"row","children":[]}', main), true);
  assert.equal(layoutChanged('{"id":"root","type":"column","children":[{"id":"status","type":"block"},{"id":"x"}]}', main), true);
});

test("layout: missing or unreadable files are never flagged", () => {
  assert.equal(layoutChanged(main, null), false, "installed before the check existed");
  assert.equal(layoutChanged(null, main), false);
  assert.equal(layoutChanged('{"id":', main), false, "half-written main.json");
});

test("layout: canonical sorts keys at every level and keeps array order", () => {
  assert.equal(canonical({ b: [2, { d: 1, c: 0 }], a: null }), '{"a":null,"b":[2,{"c":0,"d":1}]}');
  assert.match(LAYOUT_NOTE, /install\.sh/);
});
