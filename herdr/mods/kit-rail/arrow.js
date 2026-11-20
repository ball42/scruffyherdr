// The rail's alert arrows: when a Claude flares (blocked and unseen), an arrow
// at the rail's edge points at it, flaring on the card's own beat. The edge
// comes from the rail's order relative to the Claude you're in (the "here"
// card): earlier in the order is the top edge (◀ in a row), later the bottom
// (▶). Herdr can't say where the rail is scrolled, so the order decides, not
// the scroll position.

/** What clicking the arrow does (config `alert_arrow`, published as kit.alertArrow). */
export const ARROW_MODES = ["scroll-switch", "scroll", "switch"];

/** A Claude whose card is flaring: blocked, unseen, not snoozed. */
export function flaring(a) {
  return a?.attention?.kind === "blocked" && Boolean(a.attention.pulse) && !a.snoozed;
}

const target = (list, i) => (list.length ? { address: list[i].address, name: list[i].name, more: list.length - 1 } : null);

/**
 * Each edge's target: the nearest flaring Claude before `here` in the rail's
 * order, and after it, with how many more lie that way. With `here` not on
 * the rail (or null), every flaring Claude is before, the first nearest.
 */
export function alertArrows(agents, here) {
  const at = agents.findIndex((a) => a.address === here);
  const before = [];
  const after = [];
  agents.forEach((a, i) => {
    if (a.address === here || !flaring(a)) return;
    if (at < 0 || i < at) before.push(a);
    else after.push(a);
  });
  return { before: target(before, at < 0 ? 0 : before.length - 1), after: target(after, 0) };
}

/**
 * What one click does in `mode` for the card at rail row `row` (-1: gone):
 * the row to scroll to, whether to flare the card, and whether to switch to
 * its Claude. An unknown mode acts as "scroll-switch".
 */
export function arrowAction(mode, row) {
  const m = ARROW_MODES.includes(mode) ? mode : "scroll-switch";
  if (row < 0) return { scroll: null, flash: false, switch: false };
  const scroll = m !== "switch";
  return { scroll: scroll ? row : null, flash: scroll, switch: m !== "scroll" };
}
