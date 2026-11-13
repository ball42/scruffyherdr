// kit-scenes' pure logic: the picker's cursor and the tiles' inputs. No herdr
// globals here; main.js draws and wires it.

// Twelve scenes in a 4 by 3 grid: narrow enough for a half-screen window.
export const COLS = 4;

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
  return scenes
    .filter((s) => s && typeof s.key === "string" && typeof s.label === "string" && s.thumbs && s.needs)
    .map((s) => ({
      key: s.key,
      label: s.label,
      thumbs: { dark: s.thumbs.dark, light: s.thumbs.light },
      needs: { dark: s.needs.dark, light: s.needs.light },
      asks: s.asks ?? "",
      glyph: s.glyph ?? s.asks ?? "",
    }));
}

export const TILE = { w: 184, h: 104 }; // 16:9
export const GAP = 12;
export const PAD = 28;
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
