// Dressing: the one place a kit layout gets its scene look (theme pair,
// picture, see-through terminals, glass bars, Settings preview) and its kept
// clicks. install and herdr-signals both call it. Pure.

import { SCENES } from "./scenes.js";
import { wallFor } from "./wallpaper.js";
import { GLASS_AREAS, glassStrength, glassTint } from "./glass.js";
import { keepClicks } from "./clicks.js";
import { canonical } from "./layout.js";

const CLEAR = "#00000000";
export const DEFAULT_LOOK = { terminal_opacity: 0.45 };

const LOOK_CHECKS = {
  // A picture path; "", null or false turns the wallpaper off (wallpaper.js wallFor).
  wallpaper: (v) => typeof v === "string" || v === null || v === false,
  // The light-mode picture; "" means none (scripts/wallpaper.sh deletes it).
  wallpaper_light: (v) => typeof v === "string",
  terminal_opacity: (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1,
  // The glass tint strength (glass.js glassStrength): 0..1, or false for solid bars.
  glass: (v) => v === false || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1),
};

/**
 * Config `look`, checked once: each known key keeps a good value; a bad one
 * falls back to its default (terminal_opacity to DEFAULT_LOOK's, the others
 * to absent) with one problem line naming it. Unknown keys drop. Never throws.
 * @returns {{look: object, problems: string[]}}
 */
export function validLook(look) {
  const out = { ...DEFAULT_LOOK };
  const problems = [];
  if (look === null || typeof look !== "object" || Array.isArray(look)) {
    if (look !== undefined && look !== null) problems.push("⚠ config look: not an object");
    return { look: out, problems };
  }
  for (const [k, ok] of Object.entries(LOOK_CHECKS)) {
    if (!Object.prototype.hasOwnProperty.call(look, k)) continue;
    if (ok(look[k])) out[k] = look[k];
    else problems.push(`⚠ look.${k} ${(JSON.stringify(look[k]) ?? String(look[k])).slice(0, 16)}: default used`);
  }
  return { look: out, problems };
}

function find(n, id) {
  if (!n || typeof n !== "object") return null;
  if (n.id === id) return n;
  for (const c of n.children ?? []) {
    const hit = find(c, id);
    if (hit) return hit;
  }
  return null;
}

/**
 * A copy of `tree` dressed as `scene` for this appearance, with `clicks`
 * (node id -> fields, from readClicks) laid over it last so a user's size
 * beats any default. `look` is config `look`; an empty wallpaper keeps Herdr's own look.
 */
export function dress(tree, { scene, light = false, look = {}, clicks = {} }) {
  if (!SCENES[scene]) throw new Error(`unknown scene: ${scene}`);
  const out = JSON.parse(JSON.stringify(tree));
  const wallpaper = wallFor(look, light, scene);
  if (wallpaper) {
    const { terminal_opacity: opacity } = { ...DEFAULT_LOOK, ...look };
    if (typeof opacity !== "number" || opacity < 0 || opacity > 1) {
      throw new Error(`look.terminal_opacity must be 0..1, got ${opacity}`);
    }
    out.background = { image: wallpaper, fit: "cover" };
    out.terminal_opacity = opacity;
    // The pane frame paints an opaque card by default; drop it so the wallpaper shows.
    const pane = find(out, "main")?.content?.pane;
    if (pane) delete pane.background;
  }
  out.theme = { ...SCENES[scene].theme };
  // The picture Herdr's settings show (herdr/layouts/scruffy.svg, linked by install.sh): one for every scene.
  out.preview = "layouts/scruffy.svg";
  const strength = glassStrength(look);
  if (wallpaper && strength !== 0) {
    out.colors = { ...(out.colors ?? {}), chrome: CLEAR };
    for (const id of GLASS_AREAS) {
      const n = find(out, id);
      if (n) n.background = glassTint(scene, light, strength, id);
    }
  }
  return keepClicks(out, clicks);
}

/** `want` when it differs from the `shown` tree in content (key order aside), else null: no layout.set needed. */
export function applyPlan(shown, want) {
  return canonical(rounded(shown)) === canonical(rounded(want)) ? null : want;
}

/** The tree with every number held to 6 significant digits: Herdr hands back 32-bit floats (0.45 -> 0.44999998807907104). */
function rounded(tree) {
  return JSON.parse(JSON.stringify(tree, (_k, v) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toPrecision(6)) : v)));
}

export const APPLY_PROBLEM = "herdr-signals: layout failed";

/** Try an apply only when this layout|appearance|scene key isn't the one that just failed. */
export const shouldApply = (failedKey, key) => failedKey !== key;

/**
 * After an attempt: the key to stop retrying (null on success) and the
 * problem line to show (null clears it). A pass under the failed key is
 * skipped before it gets here (shouldApply); any pass under another key
 * that completes, written or not, clears the failure, so a retry runs.
 */
export function applyOutcome(key, error = null) {
  if (!error) return { failedKey: null, problem: null };
  return { failedKey: key, problem: `${APPLY_PROBLEM} (${error.message ?? error})` };
}
