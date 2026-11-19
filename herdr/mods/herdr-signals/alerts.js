// The kit's alert colours: a scene's needs-you tones derived from one colour,
// the config's `alert_colors` overrides resolved over the scene defaults, and
// the deuteranopia checks a needs-you colour must pass. Pure.
import { DONE, contrast, deltaESim, hereTones, mix } from "./colour.js";
import { SCENES } from "./scenes.js";

const HEX = /^#[0-9a-fA-F]{6}$/;
const ROLES = ["needs", "done"];
const MODES = ["dark", "light"];
const INKS = ["#0d1117", "#ffffff"];

/**
 * A scene's needs-you tones for one mode, from its needs-you and done colours:
 * the glyph's second colour (`sun`), the count, the badge behind it, and the
 * text drawn on a needs-you fill (`ink`).
 */
export function deriveTones(needs, light, done) {
  const n = needs.toLowerCase();
  return {
    orange: n,
    blue: done.toLowerCase(),
    sun: mix(n, "#ffffff", light ? 0.35 : 0.45),
    count: light ? mix(n, "#000000", 0.25) : n,
    badge: light ? mix("#ffffff", n, 0.1) : mix("#0d1117", n, 0.14),
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
  const bar = hereTones(colors, { dark: needs, light: needs }).here;
  const r = {
    done: deltaESim(needs, done),
    fill: contrast(needs, colors.background),
    bar: deltaESim(needs, bar),
    working: HEX.test(colors.working ?? "") ? deltaESim(needs, colors.working) : Infinity,
  };
  return { ...r, ok: r.done >= 20 && r.fill >= 3 && r.bar >= 15 };
}
