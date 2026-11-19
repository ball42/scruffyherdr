// The rail's "you are here": the bar and fill on the focused terminal's
// card, and when to scroll that card into view. Colours come from
// kit.tones, which herdr-signals works out per theme (colour.js).
import { div } from "gpui-kit";

/** The 3-px bar on the left edge of the focused Claude's card. */
export function hereBar(tones, t) {
  return div().absolute().left(0).top(0).bottom(0).w(3).rounded_l(6).bg(tones?.here ?? t.foreground);
}

/** The focused Claude's card fill. */
export function hereFill(tones, t) {
  return tones?.hereFill ?? t.selected;
}

/**
 * Whether to scroll this render: only when the focused terminal changed since
 * the last render (never on the first), and only to a Claude on the rail.
 * @param prev the focused terminal last render (undefined before the first)
 * @param focus the focused terminal now, or null
 * @param index that terminal's row index this render, or -1
 * @returns {{index: number|null, prev: string|null}}
 */
export function scrollStep(prev, focus, index) {
  const moved = prev !== undefined && focus !== prev;
  return { index: moved && focus !== null && index >= 0 ? index : null, prev: focus };
}
