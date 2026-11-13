// The bottom strip's counts: "✋ 2 NEEDS YOU · 14m", "☀☀ 3 asks" (a fir with
// fireflies on Endor) and "✓ 1 DONE".
// Each is a button: blocked and done go to the most urgent Claude, asks to the
// next Claude with an open card (main.js passes onUrgent and onAsks).
import { div, svg } from "gpui-kit";
import { focusLabel, focusOn, heldLabel } from "./focus.js";
import { DEFAULT_SCENE, SCENES } from "./scenes.js";

// kit-rail's tree, the one its fireflies glyph draws.
const TREE_SVG = "mods/kit-rail/tree.svg";

// Under a minute the age is noise: a prompt you are about to answer.
const AGE_AFTER_MS = 60_000;

/** "14m", "1h 5m": how long ago `since` was, in the rail's and deck's words. null under a minute. */
export function waitAge(since, now) {
  if (typeof since !== "number" || now - since < AGE_AFTER_MS) return null;
  const m = Math.floor((now - since) / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

/** The blocked count's text: "✋ 2 NEEDS YOU", with " · 14m" once the oldest has waited a minute. */
export function blockedLabel(s, now) {
  const age = waitAge(s.oldest_since, now);
  return `✋ ${s.blocked} NEEDS YOU${age ? ` · ${age}` : ""}`;
}

/**
 * The counts as buttons. Blocked and done go to the most urgent Claude
 * (`onUrgent`); the asks count goes to the next Claude with an open card
 * (`onAsks`, falling back to `onUrgent`). `scene` is the kit.scene key, for the asks glyph.
 */
export function stripCounts(t, s, onUrgent, asks = 0, now = Date.now(), onAsks = onUrgent, scene = null) {
  const count = (id, color, text, go = onUrgent) => div().id(id).px(4).rounded(4).cursor_pointer().text_color(color)
    .hover((st) => st.bg(t.hover))
    .on_click((_e, cx) => go(cx))
    .child(text);
  const out = [];
  if (s.blocked > 0) out.push(count("strip-blocked", t.blocked, blockedLabel(s, now)));
  if (asks > 0) out.push(count("strip-asks", t.foreground, asksLabel(t, asks, scene), onAsks));
  if (s.done > 0) out.push(count("strip-done", t.done, `✓ ${s.done} DONE`));
  // Focus mode holds done Claudes: shown, but muted and not a button.
  if (s.held > 0) out.push(div().id("strip-held").px(4).text_color(t.muted).tooltip("Finished while you focus. Listed in the digest when focus ends.").child(heldLabel(s.held)));
  return out;
}

/** The focus toggle: "◎ focus", or "◎ focusing 23m" (in the foreground colour) while on. */
export function focusButton(t, focus, now, onToggle, short = null) {
  const on = focusOn(focus);
  return div().id("focus-toggle").px(8).rounded(4).cursor_pointer().text_color(on ? t.foreground : t.muted)
    .hover((st) => st.text_color(t.foreground))
    .tooltip(on ? "Finished Claudes are held until focus ends. Click to end focus." : "Hold finished Claudes' alerts; blocked ones still alert.")
    .child(on || short === null ? focusLabel(focus, now) : short)
    .on_click(() => onToggle());
}

/** The one-minute digest line after focus ends; a click goes to the first finished Claude. Null once expired. */
export function digestLine(t, digest, now, onGo) {
  if (!digest || now >= digest.until) return null;
  return div().id("focus-digest").px(4).rounded(4).cursor_pointer().text_color(t.done)
    .hover((st) => st.bg(t.hover))
    .on_click((_e, cx) => onGo(cx))
    .child(`✓ ${digest.count} finished while you focused (${digest.minutes})`);
}

/** "☀☀ 3 asks", or on Endor a small fir with a firefly before "3 asks". `scene` is a scene key; unknown or null gives the default scene's glyph. */
export function asksLabel(t, asks, scene = null) {
  const words = `${asks} ${asks === 1 ? "ask" : "asks"}`;
  const glyph = (Object.prototype.hasOwnProperty.call(SCENES, scene) ? SCENES[scene] : SCENES[DEFAULT_SCENE]).asks;
  if (glyph !== "fireflies") return `${glyph} ${words}`;
  const fir = div().relative().flex_none().w(12).h(12)
    .child(svg(TREE_SVG).absolute().left(0).top(0).w(8).h(12).text_color(t.accent))
    .child(div().absolute().left(8).top(1).size(4).rounded(4).bg(t.blocked));
  return div().flex().items_center().gap(4).child(fir).child(words);
}

const BAR_W = 36;

/** A 4px rounded track with a fill `used` percent wide, in text tokens: muted, or the needs-you orange over the threshold. */
function usageBar(t, used, over) {
  const track = div().relative().flex_none().w(BAR_W).h(4).rounded(2)
    .child(div().absolute().inset_0().rounded(2).bg(t.muted).opacity(0.2));
  return used > 0 ? track.child(div().absolute().left_0().top_0().bottom_0().w(`${used}%`).rounded(2).bg(over ? t.blocked : t.muted)) : track;
}

/**
 * The usage item: "5h 14%" with its bar, "out ~3:40p" when the pace runs out,
 * then "wk 50%". Muted; orange with a glyph over a threshold; dimmed when the
 * reading is stale. Null without a meter (usage.js usageView).
 */
export function usageItem(t, view) {
  if (!view) return null;
  const part = (w) => div().text_color(w.over ? t.blocked : t.muted).child(w.text);
  const el = div().id("strip-usage").flex().items_center().gap(6).px(4).tooltip(view.tip);
  if (view.five) {
    el.child(part(view.five));
    if (view.five.used !== null) el.child(usageBar(t, view.five.used, view.five.over));
  }
  if (view.out) el.child(div().text_color(t.blocked).child(view.out));
  if (view.five && view.week) el.child(div().text_color(t.muted).child("·"));
  if (view.week) el.child(part(view.week));
  return view.stale ? el.opacity(0.5) : el;
}
