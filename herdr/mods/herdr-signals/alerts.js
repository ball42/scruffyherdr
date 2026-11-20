// The kit's alert colours: a scene's needs-you tones derived from one colour,
// the config's `alert_colors` overrides resolved over the scene defaults, and
// the deuteranopia checks a needs-you colour must pass. Pure.
import { DONE, contrast, deltaESim, hereTones, mix } from "./colour.js";
import { isLight } from "./grid.js";
import { SCENES } from "./scenes.js";

const HEX = /^#[0-9a-fA-F]{6}$/;
const ROLES = ["needs", "done"];
const MODES = ["dark", "light"];
const INKS = ["#0d1117", "#ffffff"];

/**
 * A scene's needs-you tones for one mode, from its needs-you and done colours:
 * the count, the badge behind it, and the text drawn on a needs-you fill
 * (`ink`). The badge is a faint tint of needs-you, as strong as lets the count
 * read on it at 4.5:1; the count moves away from it (darker by day, lighter by
 * night) only when no tint reads. The glyph's second colour (`sun`) is the
 * scene's own and isn't derived.
 */
export function deriveTones(needs, light, done) {
  const n = needs.toLowerCase();
  const base = light ? "#ffffff" : "#0d1117";
  // By day the count always sits a step darker than the fill it labels.
  const steps = light ? [0.25, 0.35, 0.45, 0.55, 0.65, 0.75] : [0, 0.15, 0.3, 0.45, 0.6, 0.75];
  const toward = light ? "#000000" : "#ffffff";
  // The count moves only as far as it must; at each step the strongest tint that reads wins.
  let pick = null;
  for (const s of steps) {
    const count = s ? mix(n, toward, s) : n;
    const t = [0.14, 0.1, 0.07, 0.04, 0.02].find((t) => contrast(count, mix(base, n, t)) >= 4.5);
    if (t !== undefined) { pick = { count, badge: mix(base, n, t) }; break; }
  }
  pick ??= { count: mix(n, toward, steps.at(-1)), badge: base };
  return {
    orange: n,
    blue: done.toLowerCase(),
    count: pick.count,
    badge: pick.badge,
    ink: INKS.reduce((best, c) => (contrast(c, n) > contrast(best, n) ? c : best)),
  };
}

/** One role's value for one mode, or undefined: "#rrggbb" (both modes) or {dark?, light?}. */
function pick(value, mode, where, problems) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    if (HEX.test(value)) return value;
    problems.push(`alert_colors ${where}: "${value}" is not a #rrggbb colour`);
    return undefined;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const v = value[mode];
    if (v === undefined) return undefined;
    if (typeof v === "string" && HEX.test(v)) return v;
    problems.push(`alert_colors ${where}.${mode}: "${String(v)}" is not a #rrggbb colour`);
    return undefined;
  }
  problems.push(`alert_colors ${where}: expected a colour or {dark, light}`);
  return undefined;
}

/**
 * The resolved needs-you and done tones for one scene, both modes. First hit
 * wins: `scenes[scene][role]`, then `[role]`, then the scene's default. A bad
 * value is skipped and named once in `problems`.
 * @param cfg config `alert_colors` (may be undefined)
 * @param scene the scene key
 * @param defaults the scene's SCENES entry ({needs: {dark, light}})
 */
export function resolveAlerts(cfg, scene, defaults) {
  const problems = [];
  const c = cfg && typeof cfg === "object" && !Array.isArray(cfg) ? cfg : {};
  const scenes = c.scenes && typeof c.scenes === "object" ? c.scenes : {};
  for (const k of Object.keys(scenes)) if (!Object.hasOwn(SCENES, k)) problems.push(`alert_colors scenes: no scene named "${k}"`);
  const own = Object.hasOwn(scenes, scene) ? scenes[scene] : {};
  const tones = {};
  for (const mode of MODES) {
    // Problems are named once: only the first mode's pass records them.
    const sink = mode === "dark" ? problems : [];
    const got = {};
    for (const role of ROLES) {
      got[role] = pick(own?.[role], mode, `scenes.${scene}.${role}`, sink) ?? pick(c[role], mode, role, sink);
    }
    const needs = got.needs ?? defaults?.needs?.[mode] ?? SCENES.tatooine.needs[mode];
    const done = got.done ?? DONE[mode];
    tones[mode] = deriveTones(needs, mode === "light", done);
  }
  return { tones, problems: [...new Set(problems)] };
}

/**
 * How a needs-you colour fares in one theme, seen with deuteranopia: its
 * distance from done, its contrast on the background, its distance from the
 * active bar and from the working spinner. `ok` holds the hard checks only.
 * @param colors a theme record (background, foreground, accent, working)
 */
export function checkAlert(needs, done, colors) {
  const bar = hereTones(colors, { dark: needs, light: needs }, { dark: done, light: done }).here;
  const r = {
    done: deltaESim(needs, done),
    fill: contrast(needs, colors.background),
    bar: deltaESim(needs, bar),
    working: HEX.test(colors.working ?? "") ? deltaESim(needs, colors.working) : Infinity,
  };
  return { ...r, ok: r.done >= 20 && r.fill >= 3 && r.bar >= 15 };
}

/**
 * Theme `t` (from theme()) with its blocked and done colours swapped for the
 * resolved ones (`tones`, as resolveAlerts gives them) in its mode, so
 * herdr-signals' strip follows the scene and the config. Unchanged without
 * tones, or with tones resolved for a scene other than `scene` (kit.tones
 * names its scene).
 */
export function alertTheme(t, tones, scene = null) {
  if (scene !== null && tones?.scene !== undefined && tones.scene !== scene) return t;
  const tone = tones?.[isLight(t?.background) ? "light" : "dark"];
  return tone ? { ...t, blocked: tone.orange, done: tone.blue } : t;
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** One colour value's problems: "#rrggbb", or {dark?, light?} of them. */
function valueProblems(v, where) {
  if (v === undefined) return [];
  if (typeof v === "string") return HEX.test(v) ? [] : [`alert_colors ${where}: "${v}" is not a #rrggbb colour`];
  if (!isObj(v)) return [`alert_colors ${where}: expected a colour or {dark, light}`];
  const out = [];
  for (const [k, c] of Object.entries(v)) {
    if (!MODES.includes(k)) out.push(`alert_colors ${where}: "${k}" isn't dark or light`);
    else if (typeof c !== "string" || !HEX.test(c)) out.push(`alert_colors ${where}.${k}: "${String(c)}" is not a #rrggbb colour`);
  }
  return out;
}

/** A needs/done entry's problems (the top level, or one scene's). */
function entryProblems(e, where) {
  const out = [];
  for (const k of Object.keys(e)) if (!ROLES.includes(k)) out.push(`alert_colors${where ? ` ${where.slice(0, -1)}` : ""}: "${k}" isn't needs or done`);
  for (const role of ROLES) out.push(...valueProblems(e[role], `${where}${role}`));
  return out;
}

/**
 * Every problem in config `alert_colors`, whichever scene is shown: bad
 * colours in either mode, unknown keys and scenes, wrong shapes. Each is
 * named once; resolveAlerts skips the same values.
 */
export function alertProblems(cfg) {
  if (cfg === undefined || cfg === null) return [];
  if (!isObj(cfg)) return ['alert_colors: expected an object such as {"needs": {"dark": "#ffd84d", "light": "#8a6a00"}}'];
  const { scenes, ...top } = cfg;
  const out = entryProblems(top, "");
  if (scenes !== undefined) {
    if (!isObj(scenes)) out.push("alert_colors scenes: expected {scene: {needs, done}}");
    else {
      for (const [k, e] of Object.entries(scenes)) {
        if (!Object.hasOwn(SCENES, k)) out.push(`alert_colors scenes: no scene named "${k}"`);
        else if (!isObj(e)) out.push(`alert_colors scenes.${k}: expected {needs, done}`);
        else out.push(...entryProblems(e, `scenes.${k}.`));
      }
    }
  }
  return [...new Set(out)];
}
