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
