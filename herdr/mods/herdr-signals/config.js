// What herdr-signals runs on: config.json over DEFAULTS. A missing file is the
// defaults (a gallery copy has no ~/.config/herdr-kit/); a malformed one is
// the defaults too, with a note for the strip. Pure: no herdr globals, no I/O.

/** {cfg, problem} from config.json's text (null when the file is missing). */
export function readConfig(text, defaults) {
  if (text === null || text === undefined) return { cfg: { ...defaults }, problem: null };
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
    return { cfg: { ...defaults, ...v }, problem: null };
  } catch {
    return { cfg: { ...defaults }, problem: "herdr-signals: config.json isn't valid JSON; using the defaults" };
  }
}

/** Whether config.json's text differs from what was last applied (undefined: never read). */
export function configChanged(prev, text) {
  return prev === undefined || prev !== text;
}

/**
 * A config read on the 10 s reread. The first read (no `prevCfg`) is readConfig's.
 * After that, a file that's gone (mid-save) or doesn't parse keeps `prevCfg`, so
 * a half-typed save never drops the add-ons or the look; only the parse failure
 * is named, and a later good read clears it.
 */
export function reloadConfig(prevCfg, text, defaults) {
  if (!prevCfg) return readConfig(text, defaults);
  if (text === null || text === undefined) return { cfg: prevCfg, problem: null };
  const r = readConfig(text, defaults);
  return r.problem ? { cfg: prevCfg, problem: r.problem } : r;
}

/** What clicking the rail's alert arrow does; kit-rail/arrow.js keeps the same list (a test checks). */
export const ARROW_MODES = ["scroll-switch", "scroll", "switch"];

/** Config `alert_arrow`: a known mode, else the default and a problem for the strip. */
export function validArrowMode(v) {
  if (v === undefined || v === null) return { mode: ARROW_MODES[0], problem: null };
  if (ARROW_MODES.includes(v)) return { mode: v, problem: null };
  return { mode: ARROW_MODES[0], problem: `alert_arrow: "${String(v)}" isn't scroll-switch, scroll or switch` };
}
