// The rail's alert arrows: when a Claude flares (blocked and unseen), an arrow
// at the rail's edge points at it, flaring on the card's own beat. The edge
// comes from the rail's order relative to the Claude you're in (the "here"
// card): earlier in the order is the top edge (◀ in a row), later the bottom
// (▶). Herdr can't say where the rail is scrolled, so the order decides, not
// the scroll position.
import { div } from "gpui-kit";
import { ORANGE } from "./look.js";

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

const GLYPH = { up: "▲", down: "▼", left: "◀", right: "▶" };

/**
 * One edge's arrow, a named button: the direction, ✋, the Claude's name and
 * "+N" for the others that way, in the needs-you colour. `lit` is the card's
 * own flare state (Flares.lit), so the arrow flares on the card's beat with the
 * same rise and fade as Flares.overlay.
 */
export function arrowButton({ dir, target, lit, t, onClick }) {
  const word = (text, size = 12) => div().flex_none().text_size(size).text_color(ORANGE).child(text);
  let el = div().id(`alert-arrow-${dir}`).relative().flex().flex_none().items_center().gap(5)
    .px(8).py(4).rounded(6).border(1).border_color(ORANGE).bg(t.chrome).cursor_pointer()
    .hover((st) => st.bg(t.hover))
    .tooltip(`Needs you: ${target.name}`)
    .on_click((e, cx) => onClick(e, cx))
    .child(word(GLYPH[dir] ?? "▲", 10))
    .child(word("✋"))
    .child(div().min_w(0).truncate().text_size(12).text_color(t.foreground).child(target.name));
  if (target.more > 0) el = el.child(word(`+${target.more}`, 11));
  return el.child(div().id(`alert-arrow-${dir}-flare`).absolute().inset_0().rounded(6).bg(ORANGE)
      .opacity(lit ? 0.7 : 0)
      .transition("opacity", lit ? { duration: 120, easing: "ease-out" } : { duration: 1200, easing: "ease-in" }));
}
