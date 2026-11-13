// Panel sizes per view, kept in ~/.config/herdr-kit/sizes.json as
// { "focus": {id: {size, ...}}, "grid": {...} }. herdr-signals writes it
// whenever it writes a view (Herdr's .state goes on every layout.set, and a
// reload loses what herdr-signals held in memory); make-layout reads the
// focus entry when it rebuilds. Pure.

import { treeClicks } from "./view.js";

const VIEWS = ["focus", "grid"];
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = (x) => JSON.parse(JSON.stringify(x));

/** Only own `id -> object` entries; anything else drops. */
function nodesOf(v) {
  const out = {};
  if (!isObj(v)) return out;
  for (const [id, c] of Object.entries(v)) {
    if (id === "__proto__" || !isObj(c)) continue;
    out[id] = clone(c);
  }
  return out;
}

/** sizes.json text to { focus, grid }; missing or malformed gives empty views. Never throws. */
export function readSizes(text) {
  let j = null;
  try { j = JSON.parse(text); } catch { j = null; }
  return { focus: nodesOf(j?.focus), grid: nodesOf(j?.grid) };
}

/**
 * The record after writing `tree` as `view`: that view's clicks are the
 * written tree's own (treeClicks); the other view keeps what it had, with
 * what herdr-signals holds aside for it (`aside[other]`) over that.
 */
export function sizesRecord(prev, view, tree, aside = null) {
  const p = isObj(prev) ? prev : {};
  const other = view === "grid" ? "focus" : "grid";
  return {
    [view]: treeClicks(tree),
    [other]: { ...nodesOf(p[other]), ...nodesOf(isObj(aside) ? aside[other] : null) },
  };
}

/** Canonical text for a record (focus first), so an unchanged record compares equal. */
export function sizesText(rec) {
  const r = isObj(rec) ? rec : {};
  return JSON.stringify(Object.fromEntries(VIEWS.map((v) => [v, nodesOf(r[v])])), null, 2) + "\n";
}

/** clicksAside seeded from a saved record, beneath what is already held. */
export function seedAside(aside, rec) {
  const a = isObj(aside) ? aside : {};
  const r = isObj(rec) ? rec : {};
  return Object.fromEntries(VIEWS.map((v) => [v, { ...nodesOf(r[v]), ...nodesOf(a[v]) }]));
}

/**
 * The record once sizes.json has loaded: the view writes made before the
 * load ({view, tree, aside} each, oldest first) laid over the loaded record,
 * so an early write never drops the other view's saved sizes.
 */
export function replaySizes(loaded, pending) {
  let rec = { focus: nodesOf(loaded?.focus), grid: nodesOf(loaded?.grid) };
  for (const p of Array.isArray(pending) ? pending : []) rec = sizesRecord(rec, p.view, p.tree, p.aside);
  return rec;
}
