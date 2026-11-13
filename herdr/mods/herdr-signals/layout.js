// Has Herdr's main layout changed since install.sh built kit.json from it?
// make-layout.js saves the main.json it read as ~/.config/herdr-kit/layout-source.json;
// herdr-signals compares the two. Herdr rewrites main.json without changing it,
// so mtime can't tell; this compares content with keys sorted.
// Pure: no herdr globals, no I/O. scripts/make-layout.js imports it too.

export const LAYOUT_NOTE = "↻ Herdr layout changed: run ./install.sh";

/** JSON with object keys sorted at every level, so key order never counts as a change. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * true when both texts parse and differ in content. false when either is
 * missing or unreadable: an install before this check has no source file,
 * and a half-written main.json is not a change worth flagging.
 */
export function layoutChanged(mainText, sourceText) {
  if (typeof mainText !== "string" || typeof sourceText !== "string") return false;
  try {
    return canonical(JSON.parse(mainText)) !== canonical(JSON.parse(sourceText));
  } catch {
    return false;
  }
}
