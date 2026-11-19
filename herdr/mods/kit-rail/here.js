// The rail's "you are here": the bar and fill on the focused terminal's
// card, and when to scroll that card into view. Colours come from
// kit.here, which herdr-signals works out per theme (colour.js).
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
 * the last scroll (never on the first render), and only to a Claude on the rail.
 * @param prev the terminal last scrolled to or first seen (undefined before the first render)
 * @param focus the focused terminal now, or null
 * @param index that terminal's row index this render, or -1
 * @returns {{index: number|null, prev: string|null}}
 */
export function scrollStep(prev, focus, index) {
  if (prev === undefined || focus === null) return { index: null, prev: focus };
  if (focus === prev) return { index: null, prev };
  // Focus moved to a terminal with no card yet (a Claude just starting, or a
  // shell): keep the move pending, so the card is scrolled to once it appears.
  if (index < 0) return { index: null, prev };
  return { index, prev: focus };
}
