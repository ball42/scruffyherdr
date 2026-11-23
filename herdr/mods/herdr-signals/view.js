// The kit layout's two views (focus and grid) and the requests that change
// them: what one apply step should write, the tree for a view, and which
// clicks (panel sizes) each shape keeps. main.js does the I/O. Pure.

import { GRID_NODE, KIT_LAYOUT, activeScenes, defaultScene, isGridTree, sceneOfTheme, sceneOfTree } from "./scenes.js";
import { gridLayout } from "./grid.js";
import { missingIds } from "./clicks.js";
import { applyPlan, dress, withLinkHandlers } from "./dress.js";

const VIEWS = ["focus", "grid"];
const clone = (x) => JSON.parse(JSON.stringify(x));
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const knownScene = (k) => (typeof k === "string" && Object.prototype.hasOwnProperty.call(activeScenes(), k) ? k : null);

/**
 * A scene request: "endor", or "endor:day" / "endor:night" to say which look
 * was picked (the picker's preview, or the half picked in Herdr's theme list).
 * @returns {{scene: string, look: "day"|"night"|null}|null}
 */
export function parseWant(w) {
  if (typeof w !== "string") return null;
  const [key, look, extra] = w.split(":");
  const scene = knownScene(key);
  if (!scene || extra !== undefined) return null;
  if (look === undefined) return { scene, look: null };
  return look === "day" || look === "night" ? { scene, look } : null;
}

/** The look a theme pair is pinned to: both halves one scene's day (or night) theme. Else null. */
export function pinOf(t) {
  if (!isObj(t) || t.light !== t.dark) return null;
  const scene = sceneOfTheme(t.light);
  if (!scene) return null;
  return activeScenes()[scene].theme.light === t.light ? "day" : "night";
}

/**
 * The look to pin the scene to. A requested look unlike the appearance
 * (`light`, the real one) pins it; one like it unpins (the pair follows the
 * appearance again); no look keeps whatever the file is pinned to.
 * @returns {"day"|"night"|null}
 */
export function pinFor({ look = null, light = false, fileTheme = null }) {
  if (look === "day" || look === "night") return (look === "day") === !!light ? null : look;
  return pinOf(fileTheme);
}
const knownView = (v) => (VIEWS.includes(v) ? v : null);

/**
 * One apply step's target. `shown` is the shown layout's name and `kit` the
 * name of the layout this copy dresses (default KIT_LAYOUT); `scene` and
 * `view` are what the shown tree holds; `sceneWant` / `viewWant` the latest
 * requests (kit.sceneWant, kit.viewWant). A request beats the theme-list
 * follow. `kits` is the set of kit layouts (those whose file holds a
 * herdr-signals block). Shown on another kit layout, nothing happens; off every
 * kit layout only the KIT_LAYOUT copy switches to it in focus on a scene
 * request, and a view request does nothing. On `kit` a scene request outside
 * the active set is dropped and named in `ignored`.
 * @returns {{switchTo: string|null, scene, view, follow: boolean, ignored?: string}}
 */
export function wantStep({ shown, kit = KIT_LAYOUT, kits = null, scene = null, view = null, sceneWant = null, viewWant = null, stateTheme = null, fileTheme = null }) {
  const req = parseWant(sceneWant);
  const sw = req?.scene ?? null;
  const look = req?.look ?? null;
  const vw = knownView(viewWant);
  if (shown !== kit) {
    // Another kit layout is not ours to dress or to leave; only the KIT_LAYOUT copy brings a non-kit layout back.
    const other = kits !== null && kits.has(shown);
    if (sw && !other && kit === KIT_LAYOUT) return { switchTo: KIT_LAYOUT, scene: sw, look, view: "focus", follow: false };
    return { switchTo: null, scene, look: null, view, follow: false };
  }
  const follow = !sw && !vw && isObj(stateTheme) && (stateTheme.light !== fileTheme?.light || stateTheme.dark !== fileTheme?.dark);
  const out = { switchTo: null, scene: sw ?? scene, look, view: vw ?? view, follow };
  // Name the scene when this layout lacks it; a scene it has, asked for with a bad suffix, is named as the whole request.
  const head = typeof sceneWant === "string" ? sceneWant.split(":")[0] : "";
  const asked = knownScene(head) ? sceneWant : head;
  if (!req && asked !== "") out.ignored = asked;
  return out;
}

/**
 * The fallback scene key when the tree's `scene` left the active set (the set
 * `set` lost it, or a scene file changed): `defaultScene()`. Null when it's
 * still there, or when the set is empty.
 */
export function missingScene(scene, set = activeScenes()) {
  if (typeof scene === "string" && Object.hasOwn(set, scene)) return null;
  return defaultScene();
}

/** Strip problem: a scene was asked for that this layout doesn't have, or a request for one it has with a bad suffix (the whole request is named). */
export const noSceneProblem = (key) => (key.includes(":") ? `herdr-signals: bad scene request "${key}"` : `herdr-signals: no scene "${key}" in this layout`);
/** Strip problem: the tree's scene left this layout's set. */
export const leftSceneProblem = (key, fallback) => `herdr-signals: "${key}" left this layout's scenes; showing "${fallback}"`;
export const EMPTY_SET_PROBLEM = "herdr-signals: this layout's scene file has no scenes";

/** Config `look` for a layout: one that names a scene file shows each scene's own pictures, so the user's wallpaper keys go. */
export function lookFor(look, scenesProp) {
  if (typeof scenesProp !== "string" || scenesProp === "core" || scenesProp === "") return look;
  const { wallpaper: _w, wallpaper_dark: _d, wallpaper_light: _l, ...rest } = look ?? {};
  return rest;
}

/**
 * What a pick in Herdr's theme list asks for. `fileTheme` is the layout
 * file's pair, `stateTheme` the pair in .state (one half replaced: the
 * appearance's at pick time). A scene key when that half names another scene's theme, or
 * the same scene's theme over a kept one (it resets to the scene); "keep" when
 * it names no scene (the user's own theme, left alone); null when there is no
 * pick or the half is the file's own.
 * @returns {string|"keep"|null}
 */
export function pickFollow(fileTheme, stateTheme, light) {
  if (!isObj(stateTheme)) return null;
  if (isObj(fileTheme) && stateTheme.light === fileTheme.light && stateTheme.dark === fileTheme.dark) return null;
  // Herdr replaces the half for the appearance at pick time, which may have
  // swapped since: take the half that differs from the file, the current one first.
  const halves = light ? ["light", "dark"] : ["dark", "light"];
  const half = halves.find((h) => typeof stateTheme[h] === "string" && stateTheme[h] !== fileTheme?.[h]);
  if (!half) return null;
  const picked = stateTheme[half];
  const scene = sceneOfTheme(picked);
  if (!scene) return "keep";
  return `${scene}:${activeScenes()[scene].theme.light === picked ? "day" : "night"}`;
}

/**
 * The theme pair to put in the tree when the user's own (non-scene) theme must
 * survive a write: Herdr deletes .state on every layout.set, so a "keep" pick
 * is carried into the file, and a half already in the file that names no scene
 * stays. Null when nothing is kept, or when a scene request is pending (it sets the whole look).
 */
export function keepTheme({ fileTheme = null, stateTheme = null, scene, sceneWant = null, light = false }) {
  if (parseWant(sceneWant) || !activeScenes()[scene]) return null;
  const base = activeScenes()[scene].theme;
  const src = pickFollow(fileTheme, stateTheme, light) === "keep" ? stateTheme : fileTheme;
  if (!isObj(src)) return null;
  const half = (k) => (typeof src[k] === "string" && sceneOfTheme(src[k]) === null ? src[k] : base[k]);
  const out = { light: half("light"), dark: half("dark") };
  return out.light === base.light && out.dark === base.dark ? null : out;
}

const pair = (t) => isObj(t) && typeof t.light === "string" && typeof t.dark === "string";

/**
 * The theme pair the layout FILE holds, which Herdr's layout() can't tell us
 * (it merges a theme-list pick from .state into the tree). With no pick in
 * .state the tree is the file; otherwise the pair herdr-signals last wrote,
 * else the file's text read from disk, else the scene's own pair. Never throws.
 * @returns {{light: string, dark: string}}
 */
export function recordTheme({ written = null, fileText = null, shown = null, stateTheme = null, scene = null }) {
  if (!isObj(stateTheme) && pair(shown?.theme)) return { light: shown.theme.light, dark: shown.theme.dark };
  if (pair(written)) return { light: written.light, dark: written.dark };
  try {
    const t = JSON.parse(fileText ?? "null")?.theme;
    if (pair(t)) return { light: t.light, dark: t.dark };
  } catch { /* fall through */ }
  return { ...activeScenes()[knownScene(scene) ?? sceneOfTree(shown)].theme };
}

/** The view a toggle asks for: the other one from a pending request, else from the shown view. Null off the kit layout. */
export function toggleWant(view, viewWant = null) {
  const from = knownView(viewWant) ?? knownView(view);
  if (!from) return null;
  return from === "grid" ? "focus" : "grid";
}

/** Replaces the grid in `tree` (in place) with `main`: the `main` node, or after Herdr's fold the grid node where main was. */
function putMain(tree, main) {
  const kids = tree.children ?? [];
  const at = kids.findIndex((c) => c.id === "main" || GRID_NODE.test(c.id ?? ""));
  if (at >= 0) {
    const old = kids[at];
    const node = { id: "main", type: "block", content: clone(main.content ?? {}) };
    if ((old.id === "main" || old.id === "kit-grid") && old.size) node.size = old.size;
    kids[at] = node;
    return true;
  }
  return kids.some((c) => putMain(c, main));
}

/**
 * The tree for `view`. Grid: `shown` tiled for `gridSpec`. Focus: the
 * undressed `focus` tree (layout-focus-<layout>.json). Without one, a grid gets `main`
 * back as a terminal block with Herdr's own content (`main`, main.json's
 * main node); with neither, or already in focus, `shown` comes back
 * unchanged and the caller notes LAYOUT_NOTE. Never throws for focus.
 */
export function viewTree({ view, shown, focus = null, gridSpec = null, main = null }) {
  if (view === "grid") return gridLayout(shown, gridSpec);
  if (focus) return clone(focus);
  if (!shown) return shown ?? null;
  const out = clone(shown);
  if (!isGridTree(out) || !isObj(main)) return out;
  return putMain(out, main) && !isGridTree(out) ? out : clone(shown);
}

// The node fields a click can set that the tree also carries as file values.
const CLICK_FIELDS = ["size", "hidden"];

/** id -> {size?, hidden?} for every node in `tree` that sets one: the values a click would have left. */
export function treeClicks(tree) {
  const out = {};
  const walk = (n) => {
    if (!isObj(n)) return;
    if (typeof n.id === "string") {
      const c = {};
      for (const f of CLICK_FIELDS) if (n[f] !== undefined) c[f] = clone(n[f]);
      if (Object.keys(c).length) out[n.id] = c;
    }
    (n.children ?? []).forEach(walk);
  };
  walk(tree);
  return out;
}

const pick = (o, ids) => Object.fromEntries(ids.filter((id) => id in o).map((id) => [id, clone(o[id])]));

/**
 * Clicks across a view switch `from` -> `to`. The shape being left keeps
 * aside (in `aside[from]`) what `target` lacks and its rail, whose size is
 * per view. The written tree gets `aside[to]` under the current clicks (the
 * tree's own values with `state`, the fresh .state nodes, over them), minus
 * the old shape's rail. `aside[to]` is then used up: those values become
 * file values in the written tree.
 * @returns {{aside, carry}}
 */
export function switchClicks({ shown, state = {}, target, aside = null, from, to }) {
  const cur = { ...treeClicks(shown), ...(isObj(state) ? clone(state) : {}) };
  const keep = pick(cur, [...new Set([...missingIds(target, cur), "rail"])]);
  const before = isObj(aside) ? aside : {};
  const carry = { ...clone(before[to] ?? {}), ...cur };
  delete carry.rail;
  if (before[to]?.rail) carry.rail = clone(before[to].rail);
  const next = { ...clone(before), [from]: keep, [to]: {} };
  return { aside: next, carry };
}

/**
 * What to do with kit.afterView ({view, address, argv?}) once a step has
 * run: "run" when `view` is shown and no view request is pending, "wait"
 * while one is, "drop" when it can't happen (another view, off the kit
 * layout, no address). Null without one.
 */
export function afterStep(after, view, pending) {
  if (!isObj(after)) return null;
  if (typeof after.address !== "string" || !after.address) return "drop";
  if (pending) return "wait";
  return after.view === view ? "run" : "drop";
}

/** The focus files to try for a layout, in order, in ~/.config/herdr-kit: its own, and for scruffy the old shared name until the first write moves it. */
export function focusFiles(layout) {
  return [`layout-focus-${layout}.json`, ...(layout === KIT_LAYOUT ? ["layout-focus.json"] : [])];
}

/** A layout's focus tree: the first of focusFiles(layout) in `dir` that reads as a tree, else null. `readText(path)` resolves to text or rejects. */
export async function readFocus(layout, dir, readText) {
  for (const f of focusFiles(layout)) {
    const tree = readTree(await readText(`${dir}/${f}`).catch(() => null));
    if (tree) return tree;
  }
  return null;
}

/** A layout tree from file text (a layout-focus file, main.json), or null when missing, malformed or not a tree. */
export function readTree(text) {
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  return isObj(j) && typeof j.id === "string" ? j : null;
}

/** The node with `id` in `tree`, or null. */
export function findNode(tree, id) {
  if (!isObj(tree)) return null;
  if (tree.id === id) return tree;
  for (const c of tree.children ?? []) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}

// How long a layout.switch to the kit layout may take to land before the scene request is given up.
export const SWITCH_WAIT_MS = 5000;
export const NO_KIT_PROBLEM = `herdr-signals: no ${KIT_LAYOUT} layout, run ./install.sh`;
export const SWITCH_PROBLEM = `herdr-signals: couldn't switch to ${KIT_LAYOUT}`;

/**
 * One try per scene request off the kit layout. `present` is whether
 * layouts() lists the kit layout; `tried` is {want, at} from the last switch.
 * "switch" (send layout.switch once), "wait" (sent, not landed yet),
 * "missing" (no kit layout: drop the request) or "give-up" (sent, never landed).
 */
export function switchStep({ present, tried = null, want, now }) {
  if (!present) return "missing";
  if (!isObj(tried) || tried.want !== want) return "switch";
  return now - tried.at > SWITCH_WAIT_MS ? "give-up" : "wait";
}

/**
 * What one apply pass on the kit layout writes, after wantStep and the grid
 * plan: the view's tree (viewTree on a view change, a re-tile when the grid
 * signature moved, else the shown tree), dressed with the scene, this
 * appearance and the clicks, and `write` = applyPlan's verdict (null: no
 * layout.set). `skip` when `key` is the one that just failed. Never throws:
 * a dress or grid error comes back as `error`.
 * @returns {{key, skip, next, write, aside, retiled, fallback, error}}
 */
export function stepPlan({ shown, cur, want, plan = null, clicks = {}, focus = null, main = null, aside = null, gridSig = null, look = {}, light = false, name = KIT_LAYOUT, failedKey = null, stateTheme = null, sceneWant = null, fileTheme = shown?.theme ?? null, pin = null }) {
  const { scene, view } = want;
  const key = `${name}|${light}|${scene}|${pin ?? ""}|${view}|${plan?.sig ?? ""}`;
  const out = { key, skip: false, next: null, write: null, aside: null, retiled: false, fallback: false, error: null };
  if (failedKey === key) return { ...out, skip: true };
  try {
    let tree = shown;
    let nodes = clicks;
    if (view !== cur.view) {
      tree = viewTree({ view, shown, focus, gridSpec: plan?.spec ?? null, main });
      out.fallback = view === "focus" && !focus;
      const sw = switchClicks({ shown, state: clicks, target: tree, aside, from: cur.view, to: view });
      nodes = sw.carry;
      out.aside = sw.aside;
      out.retiled = view === "grid";
      // The focus file is from install time: keep the link mods the shown layout has now.
      if (isObj(tree)) tree = withLinkHandlers(tree, shown);
    } else if (plan && plan.sig !== gridSig) {
      tree = gridLayout(shown, plan.spec);
      out.retiled = true;
    }
    out.next = dress(tree, { scene, light, look, clicks: nodes });
    // A pinned look puts that one theme in both halves; else a kept theme of the user's own may stay.
    const pinned = activeScenes()[scene]?.theme[pin === "day" ? "light" : "dark"];
    const keep = pin ? null : keepTheme({ fileTheme, stateTheme, scene, sceneWant, light });
    if (pin && pinned) out.next.theme = { light: pinned, dark: pinned };
    else if (keep) out.next.theme = keep;
    // layout() merges a .state pick into `shown`; judge the write against the file's own pair.
    out.write = applyPlan(isObj(fileTheme) ? { ...shown, theme: fileTheme } : shown, out.next);
  } catch (e) {
    return { ...out, aside: null, retiled: false, fallback: false, next: null, write: null, error: e };
  }
  return out;
}
