// Extra scenes: an overlay's scene file, checked before the kit shows
// it. A scene that fails a check is dropped with a named problem, so a bad
// entry never reaches the picker or a layout. Pure.
import { checkAlert } from "./alerts.js";
import { DONE } from "./colour.js";
import { SCENES } from "./scenes.js";

const HEX = /^#[0-9a-fA-F]{6}$/;
const MODES = ["dark", "light"];
const STATUSES = ["trial", "declined"];
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v) => typeof v === "string" && v !== "";

/** Whether a theme name is a plain file name, safe to put in `themes/<name>.json` (make-layout and herdr-signals both read through it). */
export const themeNameOk = (n) => typeof n === "string" && /^[\w.-]+$/.test(n) && n !== "." && n !== "..";

/** What's wrong with one entry, as a list of problem texts (empty when it's good). */
function entryProblems(key, e, readTheme) {
  const at = `extra scene "${key}"`;
  if (!isObj(e)) return [`${at}: not an object`];
  const out = [];
  if (!str(e.label)) out.push(`${at}: label is missing`);
  if (!STATUSES.includes(e.status)) out.push(`${at}: status must be "trial" or "declined"`);
  if (!str(e.asks)) out.push(`${at}: asks is missing`);
  for (const field of ["theme", "walls", "panel", "needs"]) {
    for (const mode of MODES) {
      const v = e[field]?.[mode];
      if (!str(v)) out.push(`${at}: ${field}.${mode} is missing`);
      else if ((field === "panel" || field === "needs") && !HEX.test(v)) out.push(`${at}: ${field}.${mode} is not a #rrggbb colour`);
    }
  }
  if (!isObj(e.tones)) out.push(`${at}: tones is missing`);
  else {
    if (e.tones.glyph !== undefined && e.tones.glyph !== "layered") out.push(`${at}: tones.glyph must be "layered"`);
    for (const mode of MODES) {
      const t = e.tones[mode];
      if (!isObj(t)) out.push(`${at}: tones.${mode} is missing`);
      else {
        for (const k of ["orange", "blue", "ink"]) {
          if (!str(t[k])) out.push(`${at}: tones.${mode}.${k} is missing`);
          else if (!HEX.test(t[k])) out.push(`${at}: tones.${mode}.${k} is not a #rrggbb colour`);
        }
      }
    }
  }
  if (out.length) return out;
  // The theme pair: each theme must exist, its blocked colour is the scene's needs-you, and that colour passes the deuteranopia checks in it.
  for (const mode of MODES) {
    const name = e.theme[mode];
    const t = readTheme(name);
    if (!isObj(t)) {
      out.push(`${at}: theme ${name} not found`);
      continue;
    }
    const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
    if (!same(t.colors?.blocked, e.needs[mode])) out.push(`${at}: theme ${name} blocked ${t.colors?.blocked} isn't needs.${mode} ${e.needs[mode]}`);
    if (!same(t.colors?.done, DONE[mode])) out.push(`${at}: theme ${name} done ${t.colors?.done} isn't ${DONE[mode]}`);
    const c = checkAlert(e.needs[mode], DONE[mode], { background: t.background, foreground: t.foreground, ...t.colors });
    if (!c.ok) out.push(`${at}: needs.${mode} ${e.needs[mode]} fails the colour-blind check in ${name}`);
  }
  for (const mode of MODES) {
    if (e.tones[mode].orange.toLowerCase() !== e.needs[mode].toLowerCase()) out.push(`${at}: tones.${mode}.orange ${e.tones[mode].orange} isn't needs.${mode} ${e.needs[mode]}`);
  }
  return out;
}

/**
 * Check a scene file's parsed JSON. Returns the entries that pass, each a
 * SCENES entry plus `status` ("trial" or "declined") and `tones` ({ glyph?,
 * dark, light }, each with at least orange, blue and ink), and a problem for
 * each entry dropped.
 * @param raw the parsed file
 * @param readTheme (name) => the parsed theme JSON, or null when there is none
 */
export function validateScenes(raw, readTheme) {
  if (!isObj(raw)) return { scenes: {}, problems: ["scene file isn't a JSON object"] };
  const scenes = {};
  const problems = [];
  for (const [key, e] of Object.entries(raw)) {
    if (Object.hasOwn(SCENES, key)) problems.push(`extra scene "${key}" clashes with a core scene`);
    else if (key.includes(":") || key === "") problems.push(`extra scene "${key}": the key can't be empty or contain ":"`);
    else {
      const p = entryProblems(key, e, readTheme);
      if (p.length) problems.push(...p);
      else scenes[key] = e;
    }
  }
  return { scenes, problems };
}

/**
 * A scene file's text, checked: validateScenes on its JSON. Text that is
 * missing or isn't JSON gives no scenes and one problem.
 * @param text the file's text, or null when it couldn't be read
 */
export function loadSceneFile(text, readTheme) {
  if (typeof text !== "string") return { scenes: {}, problems: ["scene file can't be read"] };
  let raw;
  try { raw = JSON.parse(text); } catch { return { scenes: {}, problems: ["scene file isn't JSON"] }; }
  return validateScenes(raw, readTheme);
}
