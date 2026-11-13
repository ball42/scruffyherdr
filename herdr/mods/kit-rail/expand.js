// The expanded rail card: the full question, the last lines of the Claude's
// screen, and the controls to answer it (a permission, a selection menu, or a
// question asked in text). OpenCard (at the end) holds the state and does the
// I/O; the functions above it only draw, from the OpenCard passed as `rail`.
import { div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState, Scrollbar, Textarea, TextareaState, VirtualListScrollHandle, v_virtual_list } from "gpui-base";
import { exec, focused, run, shared } from "herdr";
import { BLUE, INK, ORANGE, canCompact, copyCommand, outline, pill, replyBlock } from "./look.js";
import {
  blockKind, canAnswer, canAutoOpen, dropEnter, freshPicks, isRemote, kindLabel, menuSteps, nextToOpen,
  parsePermission, permissionSteps, pickOption, promptKey, replySteps, saidLines, sendAnswer, sendCompact, staleShown, tailLines,
} from "./answer.js";

const TAIL_EVERY = 2000; // ms between screen reads while a card is open
const READ_LINES = "40";
const MENU_MAX = 4;      // the name hook keeps at most 4 questions
const NOT_SENT = "didn't go through, ↗ open to finish";

/** hc without HC_TERMINAL_ID, so a reply arrives as typed, not wrapped in <hc from=…>. Never rejects. */
export function hcPlain(args) {
  return exec("env", ["-u", "HC_TERMINAL_ID", "hc", ...args]).catch((e) => ({ code: -1, stdout: "", stderr: String(e) }));
}

/** Herdr's status for the "same prompt" check: {state, kind, msg}, or null. */
function statusOf(r) {
  if (r.code !== 0) return null;
  try {
    const s = JSON.parse(r.stdout)?.status;
    return s && typeof s === "object" ? { state: s.state, kind: s.kind, msg: s.msg } : null;
  } catch { return null; }
}

const TAIL_ROW = 15;  // px per tail line (10.5 px mono)
const TAIL_SHOW = 6;  // lines visible before it scrolls

const stop = (_e, cx) => cx.stop_propagation();
const mono = (el, font) => (font ? el.font_family(font) : el);

/** One answer row: its key (number or checkbox), label, description; blue border and ✓ when picked. */
function optRow(t, id, keys, label, desc, picked, strong, action) {
  return h_flex().id(id).gap(8).items_center().px(8).py(5).rounded(6).border(1)
    .border_color(picked ? BLUE : t.border).bg(picked ? `${BLUE}14` : t.background)
    .cursor_pointer().hover((s) => s.bg(t.hover))
    .on_mouse_down("left", stop)
    .on_click((e, cx) => { cx.stop_propagation(); action(e, cx); })
    .children(keys)
    .child(v_flex().flex_1().min_w(0)
      .child(div().text_size(12.5).text_color(t.foreground).when(strong, (el) => el.font_semibold()).child(label))
      .when(Boolean(desc), (el) => el.child(div().text_size(11).text_color(t.muted).child(desc))))
    .when(picked, (el) => el.child(div().flex_none().text_size(11).font_semibold().text_color(BLUE).child("✓")));
}

function numKey(t, n, font) {
  return mono(div().w(14).flex_none().text_size(11).text_color(t.muted), font).child(String(n));
}

function checkKey(on, font) {
  return mono(div().flex_none().text_size(12).text_color(BLUE), font).child(on ? "☑" : "☐");
}

/** A text box frame; blue while it has the keyboard. Presses stay inside it. */
function box(t, id, el, focused) {
  return div().id(id).w_full().mt(6).px(8).py(6).rounded(6).border(1)
    .border_color(focused ? BLUE : t.border).bg(t.background).cursor_text()
    .on_mouse_down("left", stop).on_click(stop)
    .child(el.text_size(12.5).text_color(t.foreground));
}

function goButton(t, id, label, enabled, action) {
  return div().id(id).flex_none().px(10).py(4).rounded(6).border(1).text_size(12).font_semibold()
    .border_color(enabled ? ORANGE : t.border).bg(enabled ? ORANGE : t.raised).text_color(enabled ? INK : t.dim)
    .when(enabled, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)))
    .on_mouse_down("left", stop)
    .on_click((e, cx) => { cx.stop_propagation(); if (enabled) action(e, cx); })
    .child(label);
}

/**
 * The button (or "sending…") and the key hint. After a send that didn't go
 * through there is no button: the terminal may sit mid-answer, so ↗ open.
 */
function actions(t, o, button, hint) {
  return h_flex().mt(10).gap(6).items_center()
    .when(o.sending, (el) => el.child(div().text_size(11.5).text_color(t.muted).child("sending…")))
    .when(!o.sending && !o.error && Boolean(button), (el) => el.child(button))
    .child(div().flex_1())
    .child(div().flex_none().text_size(10.5).text_color(t.dim).child(hint));
}

/** The last lines of the Claude's screen: open by default, ~6 lines tall, scrolled to the end. */
function tail(rail, a, t, font) {
  const o = rail.open;
  const lines = o.tail;
  const id = `tail-${a.address}`;
  const head = div().id(`${id}-h`).text_size(11).text_color(t.muted).cursor_pointer()
    .on_mouse_down("left", stop)
    .on_click((_e, cx) => { cx.stop_propagation(); rail.toggleTail(cx); })
    .child(`${o.tailOpen ? "▾" : "▸"} last ${lines.length || 15} lines`);
  const el = v_flex().mt(8).pt(6).border_t(1).border_color(t.border).child(head);
  if (!o.tailOpen) return el;
  if (!lines.length) return el.child(div().mt(4).text_size(10.5).text_color(t.dim).child(o.read ? "(nothing on screen)" : "reading…"));
  return el.child(div().relative().mt(4).h(Math.min(lines.length, TAIL_SHOW) * TAIL_ROW)
    .child(v_virtual_list(id, lines.length, TAIL_ROW, (i) => String(i),
      (range) => lines.slice(range.start, range.end).map((l) =>
        mono(div().h(TAIL_ROW).w_full().truncate().text_size(10.5).text_color(t.dim), font).child(l)))
      .track_scroll(rail.tailScroll).size_full())
    .child(Scrollbar.vertical(id).absolute().inset_0()));
}

function permControls(rail, a, t, font) {
  const o = rail.open;
  const p = o.perm;
  const rows = p.options.map((opt) => {
    const deny = opt.n === p.deny;
    return optRow(t, `perm-${a.address}-${opt.n}`, [numKey(t, opt.n, font)], deny ? "Deny…" : opt.label, null,
      o.permPick === opt.n, opt.n === 1,
      (_e, cx) => (deny ? rail.openDeny(cx) : rail.permAnswer(opt.n, cx)));
  });
  const out = [v_flex().mt(9).gap(5).children(rows)];
  if (o.denyOpen) out.push(box(t, `deny-${a.address}`, Input.new(rail.inputs.deny), rail.typing === "deny"));
  const hint = `1–${p.options.length} pick · ⏎ send · Tab reason · Esc close`;
  out.push(actions(t, o, o.denyOpen || o.permPick ? goButton(t, `perm-go-${a.address}`, o.permPick === p.deny ? "Deny ⏎" : "Send ⏎", true, (_e, cx) => rail.send(cx)) : null, hint));
  return out;
}

function menuControls(rail, a, t, font, ready) {
  const o = rail.open;
  const qs = a.menu.questions;
  const blocks = qs.map((q, qi) => {
    const ans = o.answers[qi] ?? { picks: [] };
    const otherN = q.options.length + 1;
    const here = o.q === qi && qs.length > 1;
    const row = (n, label, desc) => {
      const on = ans.picks.includes(n);
      const keys = q.multi ? [numKey(t, n, font), checkKey(on, font)] : [numKey(t, n, font)];
      return optRow(t, `menu-${a.address}-${qi}-${n}`, keys, label, desc, on, false, (_e, cx) => rail.menuPick(qi, n, cx));
    };
    return v_flex().mt(10)
      .child(h_flex().gap(6).items_center()
        .when(here, (el) => el.child(div().flex_none().text_size(12).font_semibold().text_color(BLUE).child("›")))
        .child(div().flex_1().min_w(0).text_size(12.5).font_semibold().text_color(here || qs.length === 1 ? t.foreground : t.muted)
          .child(q.question || q.header))
        .when(q.multi, (el) => el.child(div().flex_none().text_size(11).text_color(t.muted).child("pick any"))))
      .child(v_flex().mt(5).gap(5)
        .children(q.options.map((op, i) => row(i + 1, op.label, op.description)))
        .child(row(otherN, "Other…", null)))
      .when(ans.picks.includes(otherN) && Boolean(rail.inputs.other[qi]), (el) => el.child(box(t, `other-${a.address}-${qi}`, Input.new(rail.inputs.other[qi]), rail.typing === `other${qi}`)));
  });
  const hint = qs.length > 1 ? "numbers pick · ↓ next question" : "numbers pick · ⏎ submit";
  return [...blocks, actions(t, o, goButton(t, `menu-go-${a.address}`, "Submit ⏎", ready, (_e, cx) => rail.send(cx)), hint)];
}

function replyControls(rail, a, t, hasText) {
  const o = rail.open;
  return [
    box(t, `reply-${a.address}`, Textarea.new(rail.inputs.reply), rail.typing === "reply"),
    actions(t, o, goButton(t, `reply-go-${a.address}`, "Send ⏎", hasText, (_e, cx) => rail.send(cx)), "⇧⏎ new line · Esc close"),
  ];
}

/** A menu the rail can't answer: its questions and options, read-only. */
function menuReadOnly(a, t) {
  return (a.menu?.questions ?? []).map((q) => v_flex().mt(8)
    .child(div().text_size(12.5).font_semibold().text_color(t.foreground).child(q.question || q.header))
    .children(q.options.map((op, i) => div().text_size(11.5).text_color(t.muted).child(`${i + 1}. ${op.label}`))));
}

/**
 * The open card. `x` carries what main.js draws for every card: {glyph, mark,
 * ctx, edge, meta: [elements], runs: [elements], font, overlay}, plus ready (menu
 * answers complete) and hasText (a reply typed).
 */
function expandedCard(rail, a, t, x) {
  const o = rail.open;
  const kind = blockKind(a, o.shown);
  const can = canAnswer(kind, a, o.perm);
  const tone = a.attention.kind === "done" ? BLUE : ORANGE;
  const label = kindLabel(kind, a, o.shown);
  const blocked = a.status === "blocked";

  let question = null;
  if (kind === "permission") question = a.ask ?? o.shown?.msg ?? null;
  else if (kind === "menu" && !a.menu) question = a.ask ?? o.shown?.msg ?? null;
  else if (kind === "reply") question = a.ask_text;
  else if (blocked) question = a.ask ?? o.shown?.msg ?? null;
  const detail = kind === "permission" ? a.perm?.detail || null : null;
  const said = replyBlock(t, a.address, saidLines(a), rail.copied, (key, text, cx) => copyCommand(rail, key, text, cx));

  let controls = [];
  if (can && kind === "permission") controls = permControls(rail, a, t, x.font);
  else if (can && kind === "menu") controls = menuControls(rail, a, t, x.font, x.ready);
  else if (can && kind === "reply") controls = replyControls(rail, a, t, x.hasText);
  else if (kind === "menu") controls = menuReadOnly(a, t);
  if (!can && (kind || blocked)) {
    controls.push(div().mt(9).text_size(11).text_color(t.dim)
      .child(isRemote(a.address) ? "On another machine: ↗ open to answer there" : "↗ open to answer in the terminal"));
  }

  const head = h_flex().id(`rail-head-${a.address}`).gap(7).items_center().cursor_pointer()
    .on_mouse_down("left", () => rail.remember())
    .on_click((e, cx) => rail.clicked(a, e, cx))
    .when(Boolean(x.glyph), (el) => el.child(x.glyph))
    .when(Boolean(x.mark), (el) => el.child(x.mark))
    .child(div().flex_1().min_w(0).truncate().text_size(12.5).font_semibold().text_color(t.foreground).child(a.name))
    .when(Boolean(x.ctx), (el) => el.child(x.ctx))
    .child(pill(t, `open-${a.address}`, "↗ open", (_e, cx) => rail.jump(a, cx), t.muted))
    .child(pill(t, `fold-${a.address}`, "▴", (_e, cx) => rail.collapse(cx, true), t.muted));

  const body = v_flex().id(`rail-${a.address}`).relative().w_full().px(11).py(10).gap(2).rounded(7).bg(t.selected)
    .child(head)
    .children(x.meta)
    .when(Boolean(said), (el) => el.child(said))
    .when(Boolean(label), (el) => el.child(div().mt(8).text_size(11).font_semibold().text_color(tone).child(label)))
    .when(Boolean(question), (el) => el.child(div().mt(3).text_size(13).text_color(t.foreground).child(question)))
    .when(Boolean(detail), (el) => el.child(mono(div().mt(6).px(8).py(6).rounded(5).border(1).border_color(t.border)
      .bg(t.background).text_size(11.5).text_color(t.foreground), x.font).child(detail)))
    .child(tail(rail, a, t, x.font))
    .children(controls)
    .when(Boolean(o.moved), (el) => el.child(div().mt(8).text_size(11).text_color(t.muted).child("↻ The prompt changed: check it and send again")))
    .when(Boolean(o.error), (el) => el.child(div().mt(8).text_size(11.5).font_medium().text_color(ORANGE).child(`✗ ${o.error}`)))
    .children(x.runs)
    .when(Boolean(x.edge), (el) => el.child(x.edge))
    .child(x.overlay);
  return outline(body, a.attention.kind, t);
}

/**
 * The open card's state and actions, rail-private (never a shared key). One
 * card open at a time: {address, key, q, answers, perm, shown, tail, read,
 * error, moved, sending, denyOpen, permPick, tailOpen, gen, asked}. Build it
 * in the view's init: it makes the text boxes, which need a live host call.
 * `handle` is the rail's focus handle; `jumpTo(a)` does what a click on a
 * collapsed card used to (focus, grid or spotlight).
 */
export class OpenCard {
  constructor(handle, jumpTo) {
    this.handle = handle;
    this.jumpTo = jumpTo;
    this.open = null;
    this.copied = null; // flash key for the reply's Copy pill
    this.compacting = new Set(); // addresses with a /compact in flight
    this.back = null;   // the terminal to give the keyboard back to
    this.typing = null; // which text box has the keyboard: "deny", "reply", "other<qi>"
    this.tailTask = null;
    this.replyPrev = "";
    this.replyNow = "";
    this.tailScroll = VirtualListScrollHandle.new();
    this.inputs = {
      deny: InputState.new({ placeholder: "Deny: tell Claude what to do instead (Tab)" }),
      reply: TextareaState.new({ placeholder: "Reply to Claude…", rows: 3 }),
      other: Array.from({ length: MENU_MAX }, () => InputState.new({ placeholder: "Your own answer…" })),
    };
    this.wireInputs();
  }

  wireInputs() {
    const watch = (name, st, changed) => {
      st.on("focus", (_e, cx) => { this.typing = name; cx.notify(); });
      st.on("blur", (_e, cx) => { if (this.typing === name) this.typing = null; cx.notify(); });
      st.on("change", (_e, cx) => { changed?.(st.value()); cx.notify(); });
    };
    const { deny, reply, other } = this.inputs;
    watch("deny", deny);
    deny.on("submit", (_e, cx) => this.send(cx));
    watch("reply", reply, (v) => { this.replyPrev = this.replyNow; this.replyNow = v; });
    // Enter sends; shift+enter keeps its new line.
    reply.on("submit", (e, cx) => { if (!e?.shift) this.send(cx); });
    other.forEach((st, qi) => {
      watch(`other${qi}`, st, (v) => this.otherTyped(qi, v));
      st.on("submit", (_e, cx) => this.send(cx));
    });
  }

  agent(address) {
    return (shared("herdr-kit")?.agents ?? []).find((a) => a.address === address) ?? null;
  }

  clearInputs() {
    const { deny, reply, other } = this.inputs;
    for (const s of [deny, reply, ...other]) s.set_value("");
    this.replyPrev = "";
    this.replyNow = "";
  }

  /** Typing an Other answer picks Other (ticks it, on a multi-select question). */
  otherTyped(qi, v) {
    const o = this.open;
    const menu = o && this.agent(o.address)?.menu;
    if (!menu?.questions[qi] || !o.answers[qi]) return;
    const otherN = menu.questions[qi].options.length + 1;
    if (v.trim() && !o.answers[qi].picks.includes(otherN)) o.answers = pickOption(o.answers, menu, qi, otherN);
    o.answers = o.answers.map((x, i) => (i === qi ? { ...x, other: v } : x));
  }

  /** Before the rail takes the keyboard, note which terminal had it. */
  remember() {
    if (this.handle.is_focused() || this.typing) return;
    const f = focused();
    if (f?.terminal) this.back = { pane: f.pane, terminal: f.terminal };
  }

  goBack() {
    const b = this.back;
    this.back = null;
    if (b?.pane) run("pane.focus", { pane: b.pane });
    else if (b?.terminal) run("pane.focus", { terminal: b.terminal });
  }

  /** A click toggles the card open; a double-click jumps to the Claude. */
  clicked(a, e, cx) {
    if ((e?.click_count ?? 1) >= 2) {
      if (this.open?.address === a.address) this.collapse(cx, false);
      this.jumpTo(a);
      return;
    }
    if (this.open?.address === a.address) { this.collapse(cx, true); return; }
    this.remember();
    this.expand(a, cx);
  }

  expand(a, cx) {
    this.stopTail();
    this.clearInputs();
    this.open = {
      address: a.address, key: promptKey(a), ...freshPicks(a.menu), perm: null, shown: null,
      tail: [], read: false, error: null, moved: false, sending: false, tailOpen: saidLines(a).length === 0, gen: 0, asked: null,
    };
    this.handle.focus();
    if (canAnswer(blockKind(a, null), a, null) && blockKind(a, null) === "reply") this.inputs.reply.focus();
    this.reread(cx);
    this.tailTask = cx.timer.every(TAIL_EVERY, (acx) => this.readTail(acx));
    cx.notify();
  }

  /** Closes the card; with `refocus` the keyboard goes back to the saved pane, else it is forgotten. */
  collapse(cx, refocus) {
    if (!this.open) return;
    this.close(cx);
    if (refocus) this.goBack();
    else this.back = null;
  }

  /** Closes the card and keeps the saved pane (a send may open the next card). */
  close(cx) {
    this.open = null;
    this.stopTail();
    this.clearInputs();
    this.typing = null;
    cx?.notify();
  }

  stopTail() {
    this.tailTask?.cancel();
    this.tailTask = null;
  }

  /** Reads Herdr's status (for the "same prompt" check) and the screen. */
  reread(cx) {
    const o = this.open;
    if (!o) return;
    const gen = ++o.gen;
    cx.spawn(async (acx) => {
      const [g, r] = await Promise.all([hcPlain(["get", o.address, "--json"]), hcPlain(["read", o.address, "--lines", READ_LINES])]);
      if (this.open !== o || o.gen !== gen) return;
      o.shown = statusOf(g) ?? o.shown;
      o.asked = null;
      o.error = null;
      this.takeScreen(o, r);
      acx.notify();
    });
  }

  readTail(cx) {
    const o = this.open;
    if (!o || o.sending) return;
    cx.spawn(async (acx) => {
      const r = await hcPlain(["read", o.address, "--lines", READ_LINES]);
      if (this.open === o && this.takeScreen(o, r)) acx.notify();
    });
  }

  /** Takes a screen read: the tail, and the permission options. True when either changed. */
  takeScreen(o, r) {
    if (r.code !== 0) return false;
    const lines = tailLines(r.stdout);
    const tailChanged = lines.join("\n") !== o.tail.join("\n");
    const a = this.agent(o.address);
    const perm = a && blockKind(a, o.shown) === "permission" ? parsePermission(r.stdout) : null;
    const permChanged = JSON.stringify(perm) !== JSON.stringify(o.perm);
    o.tail = lines;
    o.read = true;
    o.perm = perm;
    if (permChanged && o.permPick !== null && !perm?.options.some((x) => x.n === o.permPick)) o.permPick = null;
    if (tailChanged) this.tailScroll.scroll_to_bottom();
    return tailChanged || permChanged;
  }

  /**
   * Model republishes keep the open card. Its Claude gone: collapse. Its
   * prompt changed (answered in the terminal, a new menu): drop the picks
   * and read it again.
   */
  sync(agents, cx) {
    const o = this.open;
    if (!o) return;
    const a = agents.find((x) => x.address === o.address);
    if (!a) {
      cx.timer.after(0, (acx) => { if (this.open === o) this.collapse(acx, true); });
      return;
    }
    if (o.sending) return;
    const key = promptKey(a);
    if (key === o.key) {
      // Same prompt, new status (done turned idle when someone looked): refresh
      // the "same prompt" check, keep what's typed.
      if (staleShown(a.status, o.shown, o.asked)) {
        o.asked = a.status;
        cx.timer.after(0, (acx) => { if (this.open === o) this.reread(acx); });
      }
      return;
    }
    o.key = key;
    this.refresh(o, a, cx);
  }

  /** A new prompt: fresh picks, empty boxes, read it again. */
  refresh(o, a, cx) {
    Object.assign(o, { ...freshPicks(a?.menu), perm: null, moved: false });
    cx.timer.after(0, (acx) => {
      if (this.open !== o) return;
      this.clearInputs();
      this.reread(acx);
    });
  }

  jump(a, cx) {
    this.collapse(cx, false);
    this.jumpTo(a);
  }

  openDeny(cx) {
    const o = this.open;
    if (!o?.perm || o.sending) return;
    o.denyOpen = true;
    o.permPick = o.perm.deny;
    this.inputs.deny.focus();
    cx.notify();
  }

  permAnswer(n, cx) {
    const o = this.open;
    if (!o || o.sending) return;
    o.permPick = n;
    o.denyOpen = false;
    this.send(cx);
  }

  menuPick(qi, n, cx) {
    const o = this.open;
    const menu = o && this.agent(o.address)?.menu;
    const q = menu?.questions[qi];
    if (!q || o.sending) return;
    o.answers = pickOption(o.answers, menu, qi, n);
    o.q = qi;
    const otherN = q.options.length + 1;
    if (n === otherN && o.answers[qi].picks.includes(otherN) && this.inputs.other[qi]) this.inputs.other[qi].focus();
    else {
      this.handle.focus();
      if (!q.multi && qi < menu.questions.length - 1) o.q = qi + 1;
    }
    cx.notify();
  }

  toggleTail(cx) {
    if (this.open) this.open.tailOpen = !this.open.tailOpen;
    cx.notify();
  }

  /** `]`: the next Claude that needs you, without sending anything. */
  openNext(cx) {
    const agents = shared("herdr-kit")?.agents ?? [];
    const next = this.open && nextToOpen(agents, this.open.address);
    const a = next && agents.find((x) => x.address === next);
    if (a) this.expand(a, cx);
  }

  /** Keys while a card is open. In a text box only Enter and Esc act on the card. */
  key(e, cx) {
    const o = this.open;
    if (!o) return;
    const ks = e.keystroke;
    if (ks === "escape") { this.collapse(cx, true); cx.stop_propagation(); return; }
    if (ks === "enter") { this.send(cx); cx.stop_propagation(); return; }
    if (this.typing) return;
    const a = this.agent(o.address);
    if (!a) return;
    const kind = blockKind(a, o.shown);
    const can = canAnswer(kind, a, o.perm);
    const digit = /^[1-9]$/.test(ks) ? Number(ks) : null;
    let handled = true;
    if (ks === "]") this.openNext(cx);
    else if (digit && can && kind === "permission") {
      // The Deny number does what Tab does: pick it and open the reason box.
      if (o.sending) { /* picks wait for the send */ }
      else if (digit === o.perm.deny) this.openDeny(cx);
      else if (o.perm.options.some((x) => x.n === digit)) {
        o.permPick = digit;
        o.denyOpen = false;
      }
    } else if (digit && can && kind === "menu") this.menuPick(o.q, digit, cx);
    else if ((ks === "down" || ks === "up") && kind === "menu" && a.menu) {
      o.q = Math.max(0, Math.min(a.menu.questions.length - 1, o.q + (ks === "down" ? 1 : -1)));
    } else if (ks === "tab" && can && kind === "permission") this.openDeny(cx);
    else handled = false;
    if (handled) { cx.stop_propagation(); cx.notify(); }
  }

  /** The reply as typed, minus the new line a plain Enter just put in it. */
  replyText() {
    const v = this.inputs.reply.value();
    const before = v === this.replyNow ? this.replyPrev : this.replyNow;
    return dropEnter(before, v).trim();
  }

  /** Builds the answer's steps and sends them; nothing to send does nothing. */
  send(cx) {
    const o = this.open;
    if (!o || o.sending || o.error || !o.shown) return;
    const a = this.agent(o.address);
    if (!a) return;
    const kind = blockKind(a, o.shown);
    if (!canAnswer(kind, a, o.perm)) return;
    let steps = null;
    if (kind === "permission") {
      if (o.permPick === null) return;
      steps = o.permPick === o.perm.deny
        ? permissionSteps(o.perm, { deny: o.denyOpen ? this.inputs.deny.value() : "" })
        : permissionSteps(o.perm, { n: o.permPick });
    } else if (kind === "menu") steps = menuSteps(a.menu, o.answers);
    else if (kind === "reply") {
      const text = this.replyText();
      steps = text ? replySteps(text) : null;
    }
    if (!steps?.length) return;
    o.sending = true;
    o.error = null;
    o.moved = false;
    cx.notify();
    const { address, shown } = o;
    cx.spawn(async (acx) => {
      const h = { hc: hcPlain, sleep: (ms) => new Promise((done) => acx.timer.after(ms, () => done())) };
      let res;
      try { res = await sendAnswer(address, steps, shown, h); } catch { res = "failed"; }
      if (this.open !== o) return;
      o.sending = false;
      if (res === "sent") this.afterSent(address, acx);
      else if (res === "moved") {
        this.refresh(o, this.agent(address), acx);
        o.moved = true;
      }
      else o.error = NOT_SENT;
      acx.notify();
    });
  }

  /** The "⟲ compact" pill: types /compact for a Claude at critical context. The card shows "sending…" until it moves on. */
  compact(a, cx) {
    if (!canCompact(a) || this.compacting.has(a.address)) return;
    this.compacting.add(a.address);
    cx.notify();
    cx.spawn(async (acx) => {
      const h = { hc: hcPlain, sleep: (ms) => new Promise((done) => acx.timer.after(ms, () => done())) };
      try { await sendCompact(a.address, h); } catch { /* the pill comes back below */ }
      this.compacting.delete(a.address);
      acx.notify();
    });
  }

  /** Sent: the next Claude that needs you opens, or the keyboard goes back. */
  afterSent(address, cx) {
    const agents = shared("herdr-kit")?.agents ?? [];
    this.close(cx);
    const next = canAutoOpen(null) ? nextToOpen(agents, address) : null;
    const a = next && agents.find((x) => x.address === next);
    if (a) this.expand(a, cx);
    else this.goBack();
  }

  /** The open card. `x`: {glyph, mark, ctx, edge, meta, runs, font, overlay} from main.js. */
  draw(a, t, x) {
    return expandedCard(this, a, t, {
      ...x,
      ready: Boolean(a.menu) && menuSteps(a.menu, this.open.answers) !== null,
      hasText: Boolean(this.replyNow.trim()),
    });
  }
}
