// Fitting the bottom strip. The right-hand buttons (focus, any add-on
// buttons, scene, view) must stay visible next to the counts and the usage meter, so when the width
// is short they lose words before anything is clipped. Pure.

/** Pixel estimates, one object so they can be retuned against a live strip. */
export const METRICS = {
  CHAR_PX: 7.4, // a 12px glyph, a little generous
  BTN_PAD: 16, // px(8) both sides
  GAP: 16, // the strip's gap between parts
  MARGIN: 24, // px(12) both sides
  BAR_PX: 36 + 6 * 2, // the usage bar and its gaps
};

/** The strip block's width when the layout doesn't say (make-layout.js SIGNALS). */
export const DEFAULT_STRIP_PX = 300;

/** The strip's own width in px: the `signals` node's `size.px` in a layout tree, else 300 (a weight or no node). */
export function signalsWidth(tree) {
  const find = (n) => {
    if (!n || typeof n !== "object") return null;
    if (n.id === "signals") return n;
    for (const c of Array.isArray(n.children) ? n.children : []) { const f = find(c); if (f) return f; }
    return null;
  };
  const px = find(tree)?.size?.px;
  return typeof px === "number" && Number.isFinite(px) && px > 0 ? px : DEFAULT_STRIP_PX;
}

export const LEVELS = ["full", "short", "icons"];

/**
 * The buttons' texts at a level: full words, the scene button without its name, or glyphs only.
 * The scene glyph is ◐ while the scene follows the appearance, ☀ or ☾ while its day or night look is pinned.
 * `addons` are add-on strip buttons ({glyph, label}, addons.js): "✦ notes", or the glyph alone at icons.
 */
export function buttonTexts(level, scene, grid, pin = null, addons = []) {
  const view = grid ? ["▣", "focus"] : ["▦", "grid"];
  const look = pin === "day" ? "☀" : pin === "night" ? "☾" : "◐";
  const extra = addons.map((b) => (level === "icons" ? b.glyph : `${b.glyph} ${b.label}`));
  if (level === "icons") return { focus: "◎", addons: extra, scene: look, view: view[0] };
  return {
    focus: "◎ focus",
    addons: extra,
    scene: level === "short" || !scene ? look : `${look} ${scene}`,
    view: view.join(" "),
  };
}

/** Every button's text in strip order, flat. */
const allTexts = (b) => [b.focus, ...b.addons, b.scene, b.view];

/** The scene picker dialog's size in px. kit-scenes/picker.js dialogSize() is the source (a test checks they agree); herdr-signals can't import it. */
export const SCENES_DIALOG = { width: 828, height: 558 };

/**
 * The strings drawn left of the buttons: a problem line, the counts, the
 * focus digest and the layout note, or "all quiet" when none of the first
 * three shows (main.js draws it then).
 */
export function leftTexts({ problem = null, note = null, counts = [], digest = null } = {}) {
  const shown = [problem, ...counts, digest].filter(Boolean);
  return [...(shown.length ? shown : ["all quiet"]), ...(note ? [note] : [])];
}

/** Approximate px for the left side: `texts` are the visible count and note strings. */
export function leftPx(texts, usagePx = 0) {
  return texts.reduce((sum, t) => sum + (String(t).length * METRICS.CHAR_PX + 8 + METRICS.GAP), 0) + usagePx;
}

/** Approximate px for the usage item (null view gives 0). */
export function usagePx(view) {
  if (!view) return 0;
  let n = 0;
  if (view.five) n += view.five.text.length * METRICS.CHAR_PX + (view.five.used !== null ? METRICS.BAR_PX : 0) + 8;
  if (view.out) n += view.out.length * METRICS.CHAR_PX + 6;
  if (view.five && view.week) n += METRICS.CHAR_PX + 6;
  if (view.week) n += view.week.text.length * METRICS.CHAR_PX + 6;
  return n + METRICS.GAP;
}

/**
 * The most words that fit: "full", "short" or "icons". `width` is the strip's
 * width in px (null or not a number when unknown, which gives "short": the
 * scene name is the first to go); `left` is leftPx(...) of what sits before
 * the buttons. Icons is the floor, whether or not it fits.
 */
export function stripFit(width, left, scene, grid, addons = []) {
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return "short";
  for (const level of LEVELS) {
    const b = allTexts(buttonTexts(level, scene, grid, null, addons));
    const need = METRICS.MARGIN + left + b.reduce((s, t) => s + t.length * METRICS.CHAR_PX + METRICS.BTN_PAD, 0) + METRICS.GAP * b.length;
    if (need <= width) return level;
  }
  return "icons";
}
