// The urgency rail: every Claude in every space, most urgent first, grouped
// by space. Draws from shared("herdr-kit") (published by herdr-signals).
// Click a card to expand it in place and answer the Claude from there
// (expand.js draws it); double-click, or ↗ open, does what a click did before:
// open the grid on that Claude (in the grid, see cardClick). Props: compact
// draws one row of chips (the grid's overflow strip); strip draws the current
// space's other Claudes as cards beside a spotlight. Chips and strip cards
// don't expand: a click there still jumps.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { focused, nextCommand, panes, props, run, settings, setShared, shared, theme } from "herdr";
import { OpenCard } from "./expand.js";
import { MultiReply } from "./multi-ui.js";
import { saidGist, saidLines } from "./answer.js";
import { BLUE, Flares, ORANGE, useTheme, RunGate, asksBadge, canCompact, cardClick, compactPill, cardMark, confirmRun, copyCommand, ctxEdge, ctxFigure, ctxMeter, dismissRun, groupRuns, mark, openItems, openRunLog, outline, pill, pressRun, ranClean, runCard, runStatus, runningText, runTick, visibleRuns, snoozeControls, snoozeGlyph, snoozeLabel, snoozeSet, waited, withCard } from "./look.js";

const SPINNER = "mods/workspace-chrome/spinner.svg";

/**
 * A Claude's open-card badge, or null. On a blocked, awake Claude it carries
 * the pulsing needs-you glyph and replaces the attention glyph, so the card
 * shows that glyph once, with the count beside it.
 */
function asksFor(a) {
  const items = openItems(a);
  if (a.status === "working" || items.length === 0) return null;
  const blocked = !a.snoozed && a.attention.kind === "blocked";
  return asksBadge(items, a.card_stale && !blocked, blocked && a.attention.pulse);
}

function statusGlyph(a, t) {
  if (a.status === "working") return svg(SPINNER).size(11).flex_none().text_color(t.working).spin(900);
  if (a.status === "idle") return div().flex_none().text_color(t.dim).child("·");
  return null;
}

// An add-on badge (docs/addons.md) sets the hint line's tone: work in flight reads bright, the rest dim.
function hintColor(a, t) {
  return a.badge?.tone === "bright" ? t.foreground : t.dim;
}

/** Tells the add-on that owns `id` it was pressed; herdr-signals' press command sets the same key. */
function press(id) {
  setShared("kit.addon.press", { id, at: Date.now() });
}

/** The hint line. With a badge link, a click opens it; with a badge action, a right-click presses it. */
function hintLine(a, t) {
  const el = div().id(`hint-${a.address}`).truncate().text_size(11).text_color(hintColor(a, t)).child(a.hint);
  const b = a.badge;
  if (!b?.url && !b?.action) return el;
  return el
    .when(Boolean(b.action), (e) => e.tooltip(`Right-click: ${b.action.tip}`)
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); press(b.action.id); }))
    .when(Boolean(b.url), (e) => e.cursor_pointer().hover((s) => s.underline())
      .on_click((_e, cx) => { cx.stop_propagation(); cx.open_url(b.url); }));
}

/** The PR line for an open or draft PR. Click opens it on GitHub. */
function prLine(a, t) {
  const pr = a.pr;
  if (!pr?.url || pr.state !== "OPEN") return null;
  return div().id(`pr-${a.address}`).truncate().text_size(11).text_color(t.muted)
    .cursor_pointer().hover((s) => s.underline())
    .on_click((_e, cx) => { cx.stop_propagation(); cx.open_url(pr.url); })
    .child(`PR #${pr.number}${pr.draft ? " draft" : ""} ↗`);
}

/** "18%" beside the name once context runs low (ctxMeter decides). */
function ctxBadge(a, t) {
  return ctxFigure(ctxMeter(a.ctx_left), t);
}

/** A done card's peek: the last reply's first paragraph on one line; hover for all of it, click to open the card. */
function saidPeek(a, t) {
  return div().id(`said-${a.address}`).truncate().text_size(11).italic().text_color(t.muted)
    .tooltip(saidLines(a).join("\n"))
    .child(`“${saidGist(a)}”`);
}

function click(a) {
  const g = { ...(shared("kit.grid") ?? {}), view: shared("kit.view") };
  const act = cardClick(a.address, a.space, g);
  if (act.spotlight) setShared("kit.spotlight", act.spotlight);
  else if (act.grid) {
    // Focus first (it switches spaces), then open the grid; herdr-signals
    // lands the cursor on that Claude's tile once the grid is built.
    run("agent.focus", { terminal: act.grid });
    setShared("kit.gridFocus", { address: act.grid, at: Date.now() });
    setShared("kit.viewWant", "grid");
  } else run("agent.focus", { terminal: act.focus });
}

/** Hides one Run card on the rail and the pane header. */
function dismiss(address, r) {
  setShared("kit.runsDismissed", dismissRun(shared("kit.runsDismissed"), shared("herdr-kit")?.agents, address, r));
}

/** Snoozes a Claude ("15m", "1h", "done") or wakes it (null). */
function snooze(address, choice) {
  setShared("kit.snooze", snoozeSet(shared("kit.snooze"), address, choice));
}

export default class Rail extends View {
  init(_props, cx) {
    this.flares = new Flares();
    this.copied = null;
    this.gate = new RunGate();
    this.handle = cx.focus_handle();
    this.answer = new OpenCard(this.handle, click);
    this.multi = new MultiReply();
    // "focusable": pane.go hands the rail the keyboard with "focus".
    cx.spawn(async (acx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "focus") this.handle.focus();
        acx.notify();
      }
    });
  }

  /** The open card, drawn by expand.js. */
  expanded(a, t) {
    const glyph = a.snoozed ? snoozeGlyph(t.dim, snoozeLabel(a)) : mark(a.attention.kind, a.attention.pulse) ?? statusGlyph(a, t);
    const meta = [
      a.attention.kind === "blocked" && a.attention.since ? div().text_size(11).text_color(t.muted).child(`waiting ${waited(a.attention.since)}`) : null,
      a.attention.kind === "done" && a.attention.since ? div().text_size(11).text_color(t.muted).child(`done ${waited(a.attention.since)} ago`) : null,
      a.hint ? hintLine(a, t) : null,
      prLine(a, t),
      a.status === "working" && a.tool ? div().truncate().text_size(11).text_color(t.dim).child(a.tool) : null,
    ].filter(Boolean);
    return this.answer.draw(a, t, {
      glyph,
      mark: a.card ? cardMark(a.card, a.attention.kind === "blocked" ? ORANGE : BLUE) : null,
      ctx: ctxBadge(a, t),
      edge: ctxEdge(ctxMeter(a.ctx_left), t, 7),
      meta,
      runs: this.runRows(a, t),
      font: typeof settings()?.font_family === "string" ? settings().font_family : null,
      overlay: this.flares.overlay(a.address),
    });
  }

  /**
   * The ▶ button of a card or sequence (`gk`), through the gate: a card that
   * already ran clean arms on a press and the button becomes Cancel.
   */
  goPill(t, id, gk, label, clean, start, color = ORANGE) {
    if (this.gate.armed(gk, Date.now())) return pill(t, id, "Cancel", (_e, cx) => { this.gate.cancel(gk); cx.notify(); }, t.dim);
    return pill(t, id, label, (_e, cx) => pressRun(this.gate, gk, clean, start, cx), color);
  }

  /** The armed card's own line: "▶ Run again" on the left, away from the button. */
  againLine(t, id, gk, start) {
    return h_flex().gap(6).items_center().pt(2)
      .child(pill(t, id, "▶ Run again", (_e, cx) => confirmRun(this.gate, gk, start, cx), ORANGE))
      .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.muted).child("It already ran clean."));
  }

  /**
   * One Run card. Line one is the label (full width, so it isn't cut for the
   * buttons) and its last result; line two is the command's first line with
   * ▶ Run, Copy and ✕. A card that ran clean folds to one quiet line:
   * ✓, the label, log, ▶ Again and ✕. Hover the label or command for the full text.
   */
  runRow(a, r, i, t) {
    const key = `${a.address}-${r.id ?? i}`;
    const first = r.command.split("\n")[0] + (r.command.includes("\n") ? " …" : "");
    const st = runStatus(r.state);
    const going = st?.tone === "run";
    const tone = { run: t.foreground, ok: BLUE, bad: ORANGE, dim: t.dim };
    const head = r.step ? `${r.step}/${r.of} ${r.label}` : `▶ ${r.label}`;
    const clean = st?.tone === "ok";
    const start = () => runCard(a.address, [r], { panes, shared, setShared, run });
    const armed = !going && this.gate.armed(key, Date.now());
    const logPill = Boolean(r.state?.log) && !going ? pill(t, `run-log-${key}`, "log", () => openRunLog(a.address, r.state.log, { panes, shared, setShared, run }), t.dim) : null;
    const xPill = pill(t, `run-x-${key}`, "✕", () => dismiss(a.address, r), t.dim);
    if (clean) {
      const label = r.step ? `${r.step}/${r.of} ${r.label}` : r.label;
      return v_flex().id(`run-${key}`).mt(2).pt(3).border_t(1).border_color(t.border)
        .child(h_flex().gap(5).items_center()
          .child(div().flex_none().text_size(11).font_semibold().text_color(BLUE).child("✓"))
          .child(div().id(`run-lb-${key}`).flex_1().min_w(0).truncate().text_size(11).text_color(t.muted).tooltip(`${head}\n✓ exit 0\n\n${r.command}`).child(label))
          .when(Boolean(logPill), (el) => el.child(logPill))
          .child(this.goPill(t, `run-go-${key}`, key, "▶ Again", true, start, t.dim))
          .child(xPill))
        .when(armed, (el) => el.child(this.againLine(t, `run-again-${key}`, key, start)));
    }
    return v_flex().id(`run-${key}`).gap(2).mt(2).pt(4).border_t(1).border_color(t.border)
      .child(h_flex().gap(5).items_center()
        .child(div().id(`run-lb-${key}`).flex_1().min_w(0).truncate().text_size(11).text_color(t.foreground).tooltip(head).child(head))
        .when(Boolean(st), (el) => el.child(div().flex_none().text_size(10.5).font_medium().text_color(tone[st.tone]).child(st.text))))
      .child(h_flex().gap(5).items_center()
        .child(div().id(`run-cmd-${key}`).flex_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).tooltip(r.command)
          .when(typeof settings()?.font_family === "string", (el) => el.font_family(settings().font_family))
          .child(first))
        .when(!going, (el) => el.child(this.goPill(t, `run-go-${key}`, key, st ? "▶ Again" : "▶ Run", false, start)))
        .when(Boolean(logPill), (el) => el.child(logPill))
        .child(pill(t, `run-cp-${key}`, this.copied === key ? "✓ Copied" : "Copy", (_e, cx) => copyCommand(this, key, r.command, cx)))
        .child(xPill))
      .when(armed, (el) => el.child(this.againLine(t, `run-again-${key}`, key, start)));
  }

  /** A numbered sequence: a header with ▶ Run all, then its steps. */
  runSeq(a, seq, t) {
    const live = seq.find((r) => r.state?.state === "running");
    const going = Boolean(live);
    const key = `${a.address}-seq-${seq[0].id ?? seq[0].label}`;
    const start = () => runCard(a.address, seq, { panes, shared, setShared, run });
    const armed = !going && this.gate.armed(key, Date.now());
    return v_flex().id(`runs-${key}`).gap(2).mt(2)
      .child(h_flex().gap(5).items_center().pt(4).border_t(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().text_size(11).font_medium().text_color(t.muted).child(`In order · ${seq.length} steps${ranClean(seq) ? " · all ran clean" : ""}`))
        .when(going, (el) => el.child(div().flex_none().text_size(10.5).text_color(t.foreground).child(runningText(live.state))))
        .when(!going, (el) => el.child(this.goPill(t, `run-all-${key}`, key, `▶ Run all ${seq.length}`, ranClean(seq), start, ranClean(seq) ? t.dim : ORANGE))))
      .when(armed, (el) => el.child(this.againLine(t, `run-all-again-${key}`, key, start)))
      .children(seq.map((r, i) => this.runRow(a, r, i, t)));
  }

  /** The Claude's Run cards that aren't dismissed, sequences gathered. */
  runRows(a, t) {
    const dismissed = shared("kit.runsDismissed");
    return groupRuns(visibleRuns(a, dismissed)).map((g, i) => (g.seq ? this.runSeq(a, g.seq, t) : this.runRow(a, g.card, i, t)));
  }

  /**
   * A Claude with nothing for you (no attention, card, ask, run, hint or PR):
   * one slim line on the rail's own background, so the cards that want you
   * stand out. Working ones keep their tool, dimmed, after the name. Clicks
   * behave as on a card: one expands it, two jump to it.
   */
  quiet(a, t, current) {
    const glyph = a.snoozed ? snoozeGlyph(t.dim, snoozeLabel(a)) : statusGlyph(a, t);
    const m = ctxMeter(a.ctx_left);
    return div().id(`rail-${a.address}`).relative().w_full().px(10).py(3).rounded(6)
      .bg(current ? t.selected : t.chrome)
      .hover((s) => s.bg(t.hover))
      .on_mouse_down("left", () => this.answer.remember())
      .on_hover((h, cx) => { if (h) this.hoverCard = a.address; else if (this.hoverCard === a.address) this.hoverCard = null; cx.notify(); })
      .on_click((e, cx) => this.answer.clicked(a, e, cx))
      .when(Boolean(a.snoozed), (el) => el.opacity(0.6))
      .child(h_flex().gap(7).items_center()
        .when(this.multi.showTick(a, this.hoverCard), (el) => el.child(this.multi.tick(a, t)))
        .when(Boolean(glyph), (el) => el.child(glyph))
        .child(div().flex_none().max_w_full().truncate().text_size(12).text_color(current ? t.foreground : t.muted).child(a.name))
        .when(a.status === "working" && Boolean(a.tool), (el) => el.child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(a.tool)))
        .when(!(a.status === "working" && a.tool), (el) => el.child(div().flex_1()))
        .when(Boolean(this.multi.chip(a, t)), (el) => el.child(this.multi.chip(a, t)))
        .when(Boolean(ctxFigure(m, t)), (el) => el.child(ctxFigure(m, t))))
      .when(canCompact(a), (el) => el.child(h_flex().pt(3).child(this.compactPill(a, t))))
      .when(this.hoverCard === a.address, (el) => el.child(h_flex().pt(3).child(snoozeControls(t, `rail-zz-${a.address}`, a, (c) => snooze(a.address, c)))))
      .when(Boolean(m), (el) => el.child(ctxEdge(m, t)))
      .border(1).border_color(current ? t.border : t.chrome);
  }

  /** The "⟲ compact" pill of a Claude at critical context. */
  compactPill(a, t) {
    return compactPill(t, a, this.answer.compacting.has(a.address), (_e, cx) => this.answer.compact(a, cx));
  }

  /** True when a Claude has nothing for you: drawn as a slim quiet() line. */
  isQuiet(a) {
    return !a.attention.kind && !a.card && !a.ask && !a.ask_text && !a.hint && !(a.pr?.state === "OPEN") &&
      visibleRuns(a, shared("kit.runsDismissed")).length === 0 && a.status !== "blocked";
  }

  card(a, t, current, expandable = false) {
    const badge = asksFor(a);
    const glyph = a.snoozed ? snoozeGlyph(t.dim, snoozeLabel(a)) : badge && a.attention.kind === "blocked" ? null : mark(a.attention.kind, a.attention.pulse) ?? statusGlyph(a, t);
    const body = v_flex().id(`rail-${a.address}`).relative().w_full().px(10).py(6).gap(2).rounded(6)
      .bg(current ? t.selected : t.raised)
      .hover((s) => s.bg(t.hover))
      .when(expandable, (el) => el.on_mouse_down("left", () => this.answer.remember()))
      .on_hover((h, cx) => { if (h) this.hoverCard = a.address; else if (this.hoverCard === a.address) this.hoverCard = null; cx.notify(); })
      .on_click((e, cx) => (expandable ? this.answer.clicked(a, e, cx) : click(a)))
      .when(Boolean(a.snoozed), (el) => el.opacity(0.6))
      .child(h_flex().gap(7).items_center()
        .when(expandable && this.multi.showTick(a, this.hoverCard), (el) => el.child(this.multi.tick(a, t)))
        .when(Boolean(glyph), (el) => el.child(glyph))
        .when(Boolean(a.card), (el) => el.child(cardMark(a.card, a.attention.kind === "blocked" ? ORANGE : BLUE).opacity(a.card_stale ? 0.45 : 1)))
        .when(Boolean(badge), (el) => el.child(badge))
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).font_medium().text_color(t.foreground).child(a.name))
        .when(expandable && Boolean(this.multi.chip(a, t)), (el) => el.child(this.multi.chip(a, t)))
        .when(Boolean(ctxBadge(a, t)), (el) => el.child(ctxBadge(a, t))))
      .when(Boolean(a.hint), (el) => el.child(hintLine(a, t)))
      .when(Boolean(prLine(a, t)), (el) => el.child(prLine(a, t)))
      .when(a.attention.kind === "blocked" && Boolean(a.ask), (el) => el.child(div().truncate().text_size(11).text_color(ORANGE).child(withCard(a.card, a.ask))))
      // A finished Claude's closing question, so it reads without expanding.
      .when(a.attention.kind !== "blocked" && Boolean(a.card) && Boolean(a.ask_text), (el) => el.child(div().id(`ask-${a.address}`).truncate().text_size(11)
        .text_color(a.attention.kind === "done" ? BLUE : t.foreground).opacity(a.card_stale ? 0.6 : 1).tooltip(a.ask_text).child(withCard(a.card, a.ask_text))))
      .when(a.attention.kind === "blocked" && Boolean(a.attention.since), (el) => el.child(div().text_size(11).text_color(t.muted).child(`waiting ${waited(a.attention.since)}`)))
      .when(Boolean(saidGist(a)), (el) => el.child(saidPeek(a, t)))
      .when(a.attention.kind === "done" && Boolean(a.attention.since), (el) => el.child(div().text_size(11).text_color(t.muted).child(`done ${waited(a.attention.since)} ago`)))
      .when(a.status === "working" && Boolean(a.tool), (el) => el.child(div().truncate().text_size(11).text_color(t.dim).child(a.tool)))
      .children(this.runRows(a, t))
      .when(Boolean(ctxMeter(a.ctx_left)), (el) => el.child(ctxEdge(ctxMeter(a.ctx_left), t)))
      .when(canCompact(a), (el) => el.child(h_flex().pt(3).child(this.compactPill(a, t))))
      .when(this.hoverCard === a.address, (el) => el.child(h_flex().pt(3).child(snoozeControls(t, `rail-zz-${a.address}`, a, (c) => snooze(a.address, c)))))
      .child(this.flares.overlay(a.address));
    return outline(body, a.attention.kind, t);
  }

  /**
   * A space's heading on the rail: its name, and a count of its Claudes on the
   * right. Click it to show that space (the current one is marked ● and
   * doesn't click).
   */
  spaceHeader(a, agents, current, t, first) {
    const here = a.space === current;
    const n = agents.filter((x) => x.space === a.space).length;
    return h_flex().id(`space-${a.space}`).pt(first ? 2 : 10).pb(2).px(2).gap(5).items_center()
      .text_size(10.5).font_semibold().text_color(t.muted)
      .when(!here, (el) => el.cursor_pointer().hover((s) => s.text_color(t.foreground))
        .tooltip(`Show ${a.space_name}`)
        .on_click(() => run("space.select", { id: a.space })))
      .when(here, (el) => el.child(div().flex_none().text_size(8).text_color(t.foreground).child("●")))
      .child(div().flex_1().min_w(0).truncate().when(here, (el) => el.text_color(t.foreground)).child(a.space_name))
      .when(n > 1, (el) => el.child(div().flex_none().font_normal().text_color(t.dim).child(String(n))));
  }

  /** An add-on's row for work no Claude is on: its text, a dim sub-line, and a click to its link. */
  looseRow(r, t) {
    return v_flex().id(`loose-${r.id}`).w_full().px(10).py(4).gap(1).rounded(6)
      .when(Boolean(r.url), (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => cx.open_url(r.url)))
      .child(div().truncate().text_size(12).text_color(t.foreground).child(r.text))
      .when(Boolean(r.sub), (e) => e.child(div().truncate().text_size(11).text_color(t.dim).child(r.sub)));
  }

  chip(a, t, current) {
    const badge = asksFor(a);
    const glyph = a.snoozed ? snoozeGlyph(t.dim) : badge && a.attention.kind === "blocked" ? null : mark(a.attention.kind, a.attention.pulse) ?? statusGlyph(a, t);
    const el = h_flex().id(`chip-${a.address}`).relative().h(24).px(8).gap(6).flex_none().items_center().rounded(6)
      .bg(current ? t.selected : t.raised)
      .hover((s) => s.bg(t.hover))
      .on_click(() => click(a))
      .when(Boolean(glyph), (e) => e.child(glyph))
      .when(Boolean(a.card), (e) => e.child(cardMark(a.card, a.attention.kind === "blocked" ? ORANGE : BLUE)))
      .when(Boolean(badge), (e) => e.child(badge))
      .child(div().max_w(160).truncate().text_size(12).text_color(t.foreground).child(a.name))
      .child(this.flares.overlay(a.address));
    return outline(el, a.attention.kind, t);
  }

  render(cx) {
    // "waiting 4m" and "done 12m ago" are relative to now and the model doesn't change as time passes: redraw every 30 s.
    if (!this.clock) this.clock = cx.timer.every(30_000, (acx) => acx.notify());
    const t = theme();
    useTheme(t, shared("kit.scene"));
    const model = shared("herdr-kit");
    const agents = model?.agents ?? [];
    runTick(this, agents.some((a) => (a.runs ?? []).some((r) => r.state?.state === "running")), cx);
    const here = focused()?.terminal;
    this.flares.update(agents.map((a) => ({ key: a.address, kind: a.attention.kind, since: a.attention.since, pulse: a.attention.pulse, snoozed: Boolean(a.snoozed) })), cx);
    if (model) this.answer.sync(agents, cx);
    const keys = (el) => el.track_focus(this.handle).on_key_down((e, kcx) => { if (!this.multi.key(e, kcx, Boolean(this.answer.open))) this.answer.key(e, kcx); });

    if (props()?.strip) {
      const spot = shared("kit.grid")?.spotlight;
      const all = Boolean(shared("kit.gridAll"));
      const others = agents.filter((a) => (all || a.space === model?.current_space) && a.address !== spot);
      return keys(h_flex().id("kit-cards")).size_full().px(8).py(6).gap(6).items_stretch().bg(t.chrome).border_t(1).border_color(t.border)
        .overflow_x_scrollbar()
        .children(others.map((a) => div().w(220).flex_none().child(this.card(a, t, a.address === here))));
    }

    if (props()?.compact) {
      return keys(h_flex().id("kit-chips")).size_full().px(8).gap(4).items_center().bg(t.chrome).overflow_x_scrollbar()
        .children(agents.map((a) => this.chip(a, t, a.address === here)));
    }

    this.multi.sync(agents, cx);
    const rows = [];
    const bar = this.multi.bar(t);
    if (bar) rows.push(bar);
    let space = null;
    for (const a of agents) {
      if (a.space !== space) {
        space = a.space;
        rows.push(this.spaceHeader(a, agents, model?.current_space, t, rows.length === 0));
      }
      if (this.answer.open?.address === a.address) rows.push(this.expanded(a, t));
      else if (this.isQuiet(a)) rows.push(this.quiet(a, t, a.address === here));
      else rows.push(this.card(a, t, a.address === here, true));
    }
    if (!rows.length) rows.push(div().p(8).text_size(12).text_color(t.dim).child("No Claudes yet"));
    const loose = model?.rows ?? [];
    if (loose.length) {
      rows.push(div().pt(14).pb(2).px(2).text_size(10.5).font_semibold().text_color(t.muted).child("No Claude on these"));
      for (const r of loose) rows.push(this.looseRow(r, t));
    }
    return keys(v_flex().id("kit-rail")).size_full().p(8).gap(5).bg(t.chrome).border_l(1).border_color(t.border)
      .overflow_y_scrollbar().children(rows);
  }
}
