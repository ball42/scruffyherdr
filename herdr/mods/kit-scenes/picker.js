// kit-scenes' pure logic: the picker's cursor and the tiles' inputs. No herdr
// globals here; main.js draws and wires it.

// Eighteen scenes in a 6 by 3 grid of small tiles, 834 px wide: it fits a
// half-screen window on a 1728 px wide screen (mods can't read the window's width).
export const COLS = 6;

/** The picker's starting state: the cursor on `current` (a scene key) when it is listed, else the first tile. */
export function pickerStart(scenes, current, light = false) {
  const i = Array.isArray(scenes) ? scenes.findIndex((s) => s.key === current) : -1;
  return { index: i < 0 ? 0 : i, day: !!light, count: Array.isArray(scenes) ? scenes.length : 0, cols: COLS };
}

/**
 * One key press. Arrow keys move within the grid and stop at its edges (no
 * wrap, and never onto a missing tile in a short last row); `enter` picks the
 * tile under the cursor, `escape` closes, `n` and `d` show the night or day
 * pictures. `pick` is the scene key under the cursor (from `keys`, the scene
 * keys in tile order; also accepted as `state.keys`), null when there is none.
 * Unknown keys change nothing.
 */
export function pickerStep(state, key, keys = state.keys) {
  const { index, count, cols } = state;
  const next = { ...state };
  if (!(count > 0)) return { state: next, pick: null, close: key === "escape" };
  const col = index % cols;
  if (key === "left" && col > 0) next.index = index - 1;
  else if (key === "right" && col < cols - 1 && index + 1 < count) next.index = index + 1;
  else if (key === "up" && index - cols >= 0) next.index = index - cols;
  else if (key === "down" && index + cols < count) next.index = index + cols;
  else if (key === "n") next.day = false;
  else if (key === "d") next.day = true;
  else if (key === "escape") return { state: next, pick: null, close: true };
  else if (key === "enter") {
    // The pick carries the look its preview shows: herdr-signals pins it when it isn't the appearance's.
    const k = (Array.isArray(keys) && keys[index]) || null;
    return { state: next, pick: k && `${k}:${next.day ? "day" : "night"}`, close: true };
  }
  return { state: next, pick: null, close: false };
}

/**
 * Everything a tile draws, worked out once from kit.scenes (main.js does this
 * in init, never in render): the label, both thumbnails and both needs-you
 * colours. Entries that aren't a scene are skipped.
 */
export function tileInputs(scenes) {
  if (!Array.isArray(scenes)) return [];
  return orderTiles(scenes
    .filter((s) => s && typeof s.key === "string" && typeof s.label === "string" && s.thumbs && s.needs)
    .map((s) => ({
      key: s.key,
      label: s.label,
      thumbs: { dark: s.thumbs.dark, light: s.thumbs.light },
      needs: { dark: s.needs.dark, light: s.needs.light },
      asks: s.asks ?? "",
      glyph: s.glyph ?? s.asks ?? "",
      ...(typeof s.status === "string" ? { status: s.status } : {}),
    })));
}

/** Declined tiles after the rest (core's and trial ones), each group in its own order. */
export function orderTiles(tiles) {
  return [...tiles.filter((t) => t.status !== "declined"), ...tiles.filter((t) => t.status === "declined")];
}

/** The cross button's input from kit.cross: { name, label } or null. */
export function crossInput(cross) {
  if (!cross || typeof cross.name !== "string" || cross.name === "" || typeof cross.label !== "string" || cross.label === "") return null;
  return { name: cross.name, label: cross.label };
}

/** What a press of the cross button does: write kit.layoutWant to the name, and close. */
export function crossPress(cross) {
  const c = crossInput(cross);
  return c ? { want: c.name, close: true } : { want: null, close: false };
}

/** The grid row a tile index sits in: the picker scrolls to it past ROWS rows. */
export function rowOf(index) {
  return Math.floor(index / COLS);
}

export const TILE = { w: 124, h: 70 }; // 16:9
export const GAP = 10;
export const PAD = 20;
export const HEADER = 76; // px: the heading, the hint and the night/day toggle
export const LABEL = 30; // px under each picture
export const ROWS = 3;

/** The grid's exact height: its rows, the gaps between them and the padding. */
export function gridHeight(rows = ROWS) {
  return rows * (TILE.h + LABEL) + (rows - 1) * GAP + 2 * PAD;
}

/** The dialog's exact content size in px: the header over ROWS rows of tiles, so nothing scrolls or clips. */
export function dialogSize() {
  return { width: COLS * TILE.w + (COLS - 1) * GAP + 2 * PAD, height: HEADER + gridHeight() };
}
