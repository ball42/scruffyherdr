// The grid view: the current space's Claudes tiled, each tile a kit-pane
// header over its terminal, bordered by attention. Over nine in one space, the
// urgent ones get tiles and the rest become a chip strip; all-spaces tiles everyone. Pure: no herdr globals.

import { GRID_NODE, sceneFor } from "./scenes.js";

const MAX_TILES = 9;
// The picture Herdr's settings show: the one layout has one, in focus or grid.
export const GRID_PREVIEW = "layouts/scruffy.svg";
export function gridPreview() {
  return GRID_PREVIEW;
}
// ponytail: all-spaces tiles everyone, so tiles shrink past ~20 Claudes; cap it if that bites.
const colsFor = (n) => (n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4);
const URGENT = { blocked: 0, done: 1 };
// The same dark and light tones as kit-rail's look.js; needs-you follows the scene (spec.scene).
const DONE = { dark: "#58a6ff", light: "#0969da" };
function border(kind, light, scene) {
  const tone = light ? "light" : "dark";
  if (kind === "blocked") return { width: 2, color: sceneFor(scene).needs[tone] };
  if (kind === "done") return { width: 1, color: DONE[tone] };
  return { width: 1, color: "border" };
}

/** Whether a `#rrggbb` background is light (luminance over half); a copy of look.js's. */
export function isLight(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex ?? "");
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

/**
 * @param prevOrder tile addresses from the last layout: tiles already placed
 *   keep their places, so a tile never moves under the user's cursor.
 *   Urgency picks which Claudes get tiles and where newcomers go; a newcomer
 *   whose add-on badge links where a placed tile's does (the same piece of
 *   work) lands right after it.
 * @param spotlight an address to show alone, the rest of the space as cards;
 *   ignored unless that Claude is in `currentSpace`.
 * @param all tile every space's Claudes, not just `currentSpace`'s (kit.gridAll).
 * Pinned Claudes (row `pinned`) come first and always get tiles.
 * @returns {{cols, tiles, chips, cards, spotlight, all}} for `currentSpace`.
 */
export function gridSpec(agents, currentSpace, prevOrder = [], spotlight = null, all = false) {
  const here = all ? agents : agents.filter((a) => a.space === currentSpace);
  const spot = here.find((a) => a.address === spotlight);
  if (spot) {
    return { cols: 1, tiles: [spot], chips: [], cards: here.filter((a) => a !== spot), spotlight: spot.address, all };
  }
  // Stable: pinned, then blocked, then done, then the model's own order.
  const tier = (a) => (a.pinned ? -1 : URGENT[a.attention.kind] ?? 2);
  const ordered = here
    .map((a, i) => ({ a, i }))
    .sort((x, y) => tier(x.a) - tier(y.a) || x.i - y.i)
    .map(({ a }) => a);
  const cap = all ? Infinity : MAX_TILES;
  const picked = ordered.slice(0, cap);
  const placed = (addr) => prevOrder.indexOf(addr);
  const place = (a) => {
    const i = placed(a.address);
    if (i >= 0) return i;
    const key = a.badge?.url;
    const mate = key ? picked.find((b) => b.badge?.url === key && placed(b.address) >= 0) : null;
    return mate ? placed(mate.address) + 0.5 : Infinity;
  };
  const tiles = picked
    .map((a, i) => ({ a, i }))
    .sort((x, y) => place(x.a) - place(y.a) || x.i - y.i)
    .map(({ a }) => a);
  const n = tiles.length;
  return { cols: colsFor(n), tiles, chips: ordered.slice(cap), cards: [], spotlight: null, all };
}

/** What a re-layout depends on; names and hints redraw on their own. */
export function gridSignature(spec) {
  return `${spec.scene ?? "-"}|${spec.light ? "light" : "dark"}|${spec.all ? "all" : "one"}|${spec.cols}|${spec.tiles.map((a) => `${a.address}:${a.attention.kind ?? "-"}`).join(",")}|${spec.chips.length > 0}|${spec.spotlight ?? "-"}|${(spec.cards ?? []).length > 0}`;
}

function tile(a, light, scene) {
  return {
    id: `tile-${a.address}`,
    type: "column",
    border: border(a.attention.kind, light, scene),
    children: [
      { id: `tile-${a.address}-head`, type: "block", size: { px: 28 }, content: { mod: "kit-pane", props: a.address } },
      { id: `tile-${a.address}-term`, type: "block", content: { terminal: a.address } },
    ],
  };
}

function prune(node, ids) {
  if (!node.children) return;
  node.children = node.children.filter((c) => !ids.has(c.id));
  for (const c of node.children) prune(c, ids);
}

function find(node, id) {
  if (node.id === id) return node;
  for (const c of node.children ?? []) {
    const hit = find(c, id);
    if (hit) return hit;
  }
  return null;
}

function sizes(node, out = {}) {
  if (node.size && (node.id.startsWith("tile-") || node.id.startsWith("grid-row-"))) out[node.id] = node.size;
  for (const c of node.children ?? []) sizes(c, out);
  return out;
}

function restore(node, kept) {
  if (kept[node.id] && (node.id.startsWith("tile-") || node.id.startsWith("grid-row-"))) node.size = { ...kept[node.id] };
  for (const c of node.children ?? []) restore(c, kept);
}

/**
 * Herdr's layout() folds a one-child column into its child, so a one-row grid
 * comes back without `main`: its row (or a lone tile) sits where main was.
 * Puts an empty `main` back in place of the grid's nodes and returns it, or
 * null when the layout has no grid either.
 */
function refold(node) {
  const kids = node.children ?? [];
  const at = kids.findIndex((c) => GRID_NODE.test(c.id));
  if (at >= 0) {
    const main = { id: "main" };
    if (kids[at].id === "kit-grid" && kids[at].size) main.size = kids[at].size;
    node.children = kids.filter((c) => !GRID_NODE.test(c.id));
    node.children.splice(at, 0, main);
    return main;
  }
  for (const c of kids) {
    const hit = refold(c);
    if (hit) return hit;
  }
  return null;
}

/** Addresses the grid cycles through: pinned first, then the model's order. */
export function gridAddresses(agents, currentSpace, all = false) {
  const here = all ? agents : agents.filter((a) => a.space === currentSpace);
  return [...here.filter((a) => a.pinned), ...here.filter((a) => !a.pinned)].map((a) => a.address);
}

/**
 * What a spotlight key does in `view` (kit.view): in the grid it moves the
 * spotlight ({spot: 1 | -1}); anywhere else it is the space key it shadows
 * (global cmd-alt-] / cmd-alt-[ are space.next / space.prev), so
 * layout:scruffy binding it doesn't take space switching away in focus.
 * Null for any other command.
 */
export function spotKey(c, view) {
  if (c !== "spot-next" && c !== "spot-prev") return null;
  const dir = c === "spot-next" ? 1 : -1;
  if (view === "grid") return { spot: dir };
  return { run: dir === 1 ? "space.next" : "space.prev" };
}

/**
 * The next (dir > 0) or previous address after `current`, wrapping around.
 * `list` is addresses, rows with `address`, or a spec ({tiles, chips, cards}).
 * Unknown or null `current` starts at the first.
 */
export function spotNext(list, current, dir = 1) {
  const items = Array.isArray(list) ? list : [...list.tiles, ...(list.cards ?? []), ...list.chips];
  const addrs = items.map((x) => (typeof x === "string" ? x : x.address));
  if (!addrs.length) return null;
  const i = addrs.indexOf(current);
  if (i < 0) return addrs[0];
  const step = dir === "prev" || dir < 0 ? -1 : 1;
  return addrs[(i + step + addrs.length) % addrs.length];
}

// A landing request older than this is dropped: the grid switch it was for
// never happened, and a later cmd-shift-g shouldn't act on it.
const LANDING_TTL_MS = 5000;

/**
 * Where a focus-view rail click lands once the grid is built. `req` is
 * {address, at} from shared "kit.gridFocus"; `tiles` are the grid's tile
 * addresses. "wait" until the model has moved to the Claude's space (the
 * rail focused it, which switches spaces); "focus" its tile; "spotlight" it
 * when it has no tile (focus on an untiled terminal would leave the grid);
 * "drop" a request that is stale or names a Claude that is gone.
 */
export function gridLanding(req, agents, currentSpace, all, tiles, now) {
  if (!req || now - req.at > LANDING_TTL_MS) return "drop";
  const a = agents.find((x) => x.address === req.address);
  if (!a) return "drop";
  if (!all && a.space !== currentSpace) return "wait";
  return tiles.includes(req.address) ? "focus" : "spotlight";
}

/**
 * Returns a copy of `base` whose `main` node holds the grid for `spec` in a `kit-grid` node. Tiles and
 * rows keep the `size` they have in `base` (matched by id), so a tile the user
 * resized survives a re-tile.
 */
export function gridLayout(base, spec) {
  // Herdr's mod runtime has no structuredClone; layouts are plain JSON.
  const out = JSON.parse(JSON.stringify(base));
  out.preview = gridPreview();
  const kept = sizes(out);
  // The grid is for terminals. layout() can collapse the hidden `panel`
  // column into `panel-body` and lose `hidden`, so drop both outright.
  prune(out, new Set(["panel", "panel-body"]));
  const main = find(out, "main") ?? refold(out);
  if (!main) throw new Error("layout has no node with id 'main'");
  // The grid node takes main's place rather than sitting inside it, and a
  // tile header's props is its bare address: Herdr refuses a layout.set
  // argument nested more than 16 levels deep (tests/grid.test.js pins it).
  const keep = main.size;
  for (const k of Object.keys(main)) delete main[k];
  main.id = "kit-grid";
  if (keep) main.size = keep;
  if (!spec.tiles.length) {
    main.type = "block";
    main.content = { mod: "kit-rail" };
    return out;
  }
  const rows = [];
  for (let i = 0; i < spec.tiles.length; i += spec.cols) {
    rows.push({ id: `grid-row-${rows.length}`, type: "row", children: spec.tiles.slice(i, i + spec.cols).map((a) => tile(a, spec.light, spec.scene)) });
  }
  if (spec.cards?.length) {
    rows.push({ id: "grid-cards", type: "block", size: { px: 104 }, content: { mod: "kit-rail", props: { strip: true } } });
  }
  if (spec.chips.length) {
    rows.push({ id: "grid-chips", type: "block", size: { px: 30 }, content: { mod: "kit-rail", props: { compact: true } } });
  }
  main.type = "column";
  main.children = rows;
  restore(main, kept);
  return out;
}

/**
 * Whether to hand the grid back to the focus view. The grid shows only
 * Claudes, so a new tab, or focus on a terminal with no tile, would be
 * invisible there. `now` is {space, tabs, terminal, tiles, all}. The first
 * call after entering (prev null) and a space switch only record. In all-spaces
 * mode `tabs` holds every space's tabs, so a space switch is not special (every
 * tab is already known); flipping the mode only records.
 */
export function gridLeave(prev, now) {
  const all = !!now.all;
  const state = { space: now.space, tabs: now.tabs, terminal: now.terminal, all };
  if (!prev || prev.all !== all || (!all && prev.space !== now.space)) return { leave: false, state };
  const newTab = now.tabs.some((t) => !prev.tabs.includes(t));
  const moved = now.terminal !== prev.terminal && now.terminal !== null && !now.tiles.includes(now.terminal);
  return { leave: newTab || moved, state };
}
