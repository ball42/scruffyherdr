// The rail's "you are here": the bar and fill on the focused terminal's
// card, and when to scroll that card into view. Colours come from
// kit.here, which herdr-signals works out per theme (colour.js).
import { div } from "gpui-kit";

/**
 * The 3-px bar on the left edge of the focused Claude's card: a pill inset
 * from the card's ends and edge, so it clears the rounded corners and sits
 * inside a needs-you outline. Draw it inside the card's own bordered element.
 */
export function hereBar(tones, t) {
  return div().absolute().left(1).top(4).bottom(4).w(3).rounded_full().bg(tones?.here ?? t.foreground);
}

/**
 * The left padding every card keeps, focused or not, so its text doesn't
 * move when the bar arrives: the bar's 4 px plus the card's usual gap.
 */
export const HERE_PAD = { card: 14, chip: 12, open: 15 };

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

/**
 * The rail list's rows in order, as plain records the render draws: the
 * multi-select bar, each space's header ({first}), each Claude, the "no
 * Claudes" line, then the loose rows under their heading. `rowOf` is each
 * Claude's row index, for ScrollHandle.scroll_to_item.
 * @param agents the rail's Claudes, grouped by space in order
 * @param opts {bar: whether the multi bar shows, loose: the add-on rows}
 */
export function railRows(agents, { bar = false, loose = [] } = {}) {
  const rows = [];
  const rowOf = {};
  if (bar) rows.push({ kind: "bar" });
  let space;
  for (const a of agents) {
    if (a.space !== space) {
      space = a.space;
      rows.push({ kind: "space", a, first: rows.length === 0 });
    }
    rowOf[a.address] = rows.length;
    rows.push({ kind: "claude", a });
  }
  if (!rows.length) rows.push({ kind: "empty" });
  if (loose.length) {
    rows.push({ kind: "looseHead" });
    for (const r of loose) rows.push({ kind: "loose", r });
  }
  return { rows, rowOf };
}
