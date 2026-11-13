// Replying to several done or idle Claudes at once from the rail. This file is
// the pure part (who can be ticked, pruning, the send queue, the results) and
// the drawing of the tick box, the result chip and the bar. No herdr I/O; the
// controller that owns the state is multi-ui.js.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { BLUE, INK, ORANGE, pill } from "./look.js";
import { isRemote, promptKey } from "./answer.js";

export const QUICK = ["continue", "yes"];

/** Whether a Claude can be ticked: done or idle, and on this machine. Blocked menus differ, so they are left out. */
export function canTick(a) {
  return Boolean(a) && (a.status === "done" || a.status === "idle") && !isRemote(a.address);
}

/** The selection without addresses that are gone or no longer done or idle. */
export function pruneSelection(sel, agents) {
  const list = Array.isArray(sel) ? sel : [];
  const live = new Set((agents ?? []).filter(canTick).map((a) => a.address));
  const out = [];
  for (const addr of list) if (live.has(addr) && !out.includes(addr)) out.push(addr);
  return { sel: out, changed: out.length !== list.length };
}

/** The selection with `address` added or removed. */
export function toggleSelection(sel, address) {
  const list = Array.isArray(sel) ? sel : [];
  return list.includes(address) ? list.filter((x) => x !== address) : [...list, address];
}

/** The send queue, in tick order: each address with the prompt key it had when ticked. */
export function buildQueue(sel, agents, keys = {}) {
  return (Array.isArray(sel) ? sel : []).map((address) => {
    const a = (agents ?? []).find((x) => x.address === address);
    return { address, key: keys[address] ?? (a ? promptKey(a) : null) };
  });
}

/** sendAnswer's result as the card shows it: "sent", "changed" or "failed". */
export function resultOf(res) {
  if (res === "sent") return "sent";
  if (res === "moved") return "changed";
  // Keys went in but the Claude didn't move on yet: say so, so nobody sends twice.
  if (res === "stuck") return "stuck";
  return "failed";
}

/**
 * Sends `text` to each queued Claude one after another with `send(address)`.
 * A Claude that is no longer done or idle, or whose prompt key differs from
 * the one it had when ticked, is skipped as "changed". `agents()` is read
 * fresh for each; `onResult(results)` gets a copy after each change.
 * Resolves to {address: "sent" | "changed" | "failed"}.
 */
export async function runQueue({ queue, text, agents, send, onResult }) {
  const results = {};
  if (!String(text ?? "").trim()) return results;
  const note = () => onResult?.({ ...results });
  for (const item of queue) {
    const cur = (agents() ?? []).find((x) => x.address === item.address);
    if (!canTick(cur) || (item.key !== null && promptKey(cur) !== item.key)) {
      results[item.address] = "changed";
      note();
      continue;
    }
    results[item.address] = "sending";
    note();
    let res;
    try { res = await send(item.address); } catch { res = "failed"; }
    results[item.address] = resultOf(res);
    note();
  }
  return results;
}

/** The words on a card for a result. */
export const RESULT_TEXT = { sending: "sending…", sent: "sent", failed: "didn't send", stuck: "sent?", changed: "changed" };

/** "sending…", "sent", "didn't send" or "changed" at the end of a card's first row. */
export function resultChip(t, address, state) {
  const color = state === "failed" ? ORANGE : state === "sent" ? BLUE : t.muted;
  return div().id(`multi-res-${address}`).flex_none().text_size(11).font_medium().text_color(color).child(RESULT_TEXT[state] ?? state);
}

/** The small tick box on a card; the click ticks it and doesn't reach the card. */
export function tickBox(t, address, ticked, toggle) {
  return div().id(`multi-tick-${address}`).flex_none().text_size(13).cursor_pointer()
    .text_color(ticked ? BLUE : t.dim)
    .hover((s) => s.text_color(BLUE))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => { cx.stop_propagation(); toggle(address, cx); })
    .child(ticked ? "☑" : "☐");
}

/**
 * The bar at the top of the rail once 2 or more are ticked. `o`: {n, field
 * (the reply input element), running ({done, total} or null), hasText,
 * send(text, cx), clear(cx)}. Buttons are inert while a run is going.
 */
export function multiBar(t, o) {
  const busy = Boolean(o.running);
  const quick = QUICK.map((q) => (busy
    ? div().flex_none().px(6).py(1).text_size(11).text_color(t.dim).child(q)
    : pill(t, `multi-q-${q}`, q, (_e, cx) => o.send(q, cx))));
  const go = busy
    ? div().text_size(11.5).text_color(t.muted).child(`sending… ${o.running.done}/${o.running.total}`)
    : div().id("multi-send").flex_none().px(10).py(4).rounded(6).border(1).text_size(12).font_semibold()
      .border_color(o.hasText ? ORANGE : t.border).bg(o.hasText ? ORANGE : t.raised).text_color(o.hasText ? INK : t.dim)
      .when(o.hasText, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); if (o.hasText) o.send(null, cx); })
      .child(`send to ${o.n}`);
  return div().id("multi-bar").w_full().px(10).py(8).rounded(6).border(1).border_color(BLUE).bg(t.raised)
    .child(h_flex().gap(8).items_center()
      .child(div().flex_1().text_size(12).font_semibold().text_color(t.foreground).child(`${o.n} selected`))
      .when(!busy, (el) => el.child(pill(t, "multi-clear", "clear", (_e, cx) => o.clear(cx), t.dim))))
    .child(div().id("multi-field").w_full().mt(6).px(8).py(6).rounded(6).border(1).border_color(t.border).bg(t.background)
      .cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => cx.stop_propagation())
      .child(o.field.text_size(12.5).text_color(t.foreground)))
    .child(h_flex().mt(6).gap(6).items_center().children(quick).child(div().flex_1()).child(go));
}
