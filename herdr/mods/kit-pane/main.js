// The focus view's pane header (based on Herdr's shipped "pane" mod): icon,
// the Claude's herdr-kit name, folder, status, hover buttons. A Claude that
// needs you gets an orange underline, twin suns and "Needs you"; done gets ✓.
// Props from the app: { pane } or { terminal }. Click: focus the pane. As a
// grid tile header, click toggles the spotlight; hover adds spotlight and
// "open in focus view" buttons.
import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, setShared, shared, theme, home } from "herdr";
import { BLUE, Flares, ORANGE, useTheme, RunGate, cardMark, copyCommand, dismissRun, firstOpenRun, groupRuns, mark, openRunLog, pill, pressRun, runCard, runStatus, runningText, runTick, SNOOZE_CHOICES, snoozeLabel, snoozeSet, visibleRuns, waited, withCard } from "./look.js";

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

/** The terminal a grid tile header is for: props is its address. Null on a pane. */
export function tileTerminal(pr) {
  return typeof pr === "string" && pr ? pr : null;
}

export default class KitPane extends View {
  init() { this.hovered = false; this.flares = new Flares(); this.copied = null; this.gate = new RunGate(); }

  // A grid tile's header gets its terminal address as the bare props string
  // (herdr-signals grid.js keeps the tile tree shallow); a pane gets {pane}.
  me() {
    const pr = props() ?? {};
    const term = tileTerminal(pr);
    return panes().find((p) => (pr.pane && p.pane === pr.pane) || (term && p.terminal === term));
  }

  button(t, id, ic, command, args) {
    return div().id(id).p(3).rounded(4).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); run(command, args); })
      .child(svg(`mods/pane/${ic}.svg`).size(14));
  }

  textButton(t, id, label, action) {
    return div().id(id).px(5).py(1).rounded(4).text_size(12).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); action(); })
      .child(label);
  }

  render(cx) {
    // "waiting 4m" is relative to now and the model doesn't change as time passes: redraw every 30 s.
    if (!this.clock) this.clock = cx.timer.every(30_000, (acx) => acx.notify());
    const t = theme();
    useTheme(t, shared("kit.scene"));
    const p = this.me();
    if (!p) return div();
    const tile = Boolean(tileTerminal(props())) && shared("kit.view") === "grid";
    const spot = shared("kit.grid")?.spotlight ?? null;
    const lit = tile && spot === p.terminal;
    const toggleSpot = () => setShared("kit.spotlight", lit ? null : p.terminal);
    const kit = (shared("herdr-kit")?.agents ?? []).find((a) => a.address === p.terminal);
    const snoozed = Boolean(kit?.snoozed);
    const snooze = (choice) => setShared("kit.snooze", snoozeSet(shared("kit.snooze"), p.terminal, choice));
    // The three choices, or "wake" while snoozed (same as the rail).
    const snoozeButtons = (el) => (snoozed && !kit?.snooze_focus
      ? el.child(this.textButton(t, `kp-zz-wake-${pane}`, "wake", () => snooze(null)))
      : el.children(SNOOZE_CHOICES.map(([c, label]) => this.textButton(t, `kp-zz-${c}-${pane}`, label, () => snooze(c)))));
    const togglePin = () => {
      const pins = shared("kit.pins") ?? [];
      setShared("kit.pins", pins.includes(p.terminal) ? pins.filter((x) => x !== p.terminal) : [...pins, p.terminal]);
    };
    const pinned = Boolean(kit?.pinned);
    const kind = kit?.attention.kind ?? null;
    const fallback = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const name = kit?.name ?? fallback;
    const pic = icon(p.program, 14, t.dim);
    const pane = p.pane;
    // The first Run card that hasn't finished gets its buttons here (and Run
    // all when it starts a sequence); the rail lists them all.
    const runs = visibleRuns(kit, shared("kit.runsDismissed"));
    const r0 = firstOpenRun(runs);
    const st0 = r0 ? runStatus(r0.state) : null;
    const seq0 = r0?.step ? groupRuns(runs).find((g) => g.seq?.includes(r0))?.seq ?? null : null;
    const live = runs.find((r) => r.state?.state === "running");
    const going = Boolean(live);
    runTick(this, going, cx);
    // The header only shows a card that hasn't run clean, so ▶ never needs a
    // confirm here; the gate still drops a second press while the run starts.
    const go = (gk, steps) => (_e, cx2) => pressRun(this.gate, gk, false, () => runCard(p.terminal, steps, { panes, shared, setShared, run }), cx2);
    this.flares.update(kit ? [{ key: pane, kind, since: kit.attention.since, pulse: kit.attention.pulse, snoozed }] : [], cx);
    return h_flex().id(`kit-pane-${pane}`).relative().size_full().px(10).gap(8).items_center()
      .bg(t.background)
      .border_b(kind === "blocked" ? 2 : 1)
      .border_color(kind === "blocked" ? ORANGE : kind === "done" ? BLUE : t.border)
      .text_size(12)
      .on_hover((hovered, cx2) => { this.hovered = hovered; cx2.notify(); })
      .on_click(() => (tile ? toggleSpot() : run("pane.focus", { pane })))
      .when(Boolean(pic), (el) => el.child(pic))
      .when(tile && pinned, (el) => el.child(div().flex_none().text_color(t.dim).child("⚲")))
      .child(div().flex_none().truncate().max_w(260).font_medium().text_color(t.foreground).child(name))
      .when(Boolean(kit?.hint), (el) => el.child(div().flex_none().truncate().max_w(220).text_color(t.muted).child(kit.hint)))
      .child(div().flex_1().truncate().text_color(t.dim).child(folder(p.cwd)))
      .when(p.status === "working", (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(kind === "blocked", (el) => el
        .child(mark("blocked", kit.attention.pulse))
        .when(Boolean(kit.card), (e) => e.child(cardMark(kit.card, ORANGE)))
        .child(div().flex_none().text_size(10.5).font_semibold().text_color(ORANGE).child("Needs you"))
        .when(Boolean(kit.attention.since), (e) => e.child(div().flex_none().text_size(10.5).text_color(t.muted).child(`· ${waited(kit.attention.since)}`)))
        .when(Boolean(kit.ask), (e) => e.child(div().truncate().max_w(320).text_size(11).text_color(ORANGE).child(withCard(kit.card, kit.ask)))))
      .when(Boolean(r0), (el) => el
        .child(div().id(`kp-lb-${pane}`).flex_none().truncate().max_w(200).text_size(11).text_color(t.foreground).tooltip(`${r0.label}\n\n${r0.command}`).child(r0.step ? `▶ ${r0.step}/${r0.of} ${r0.label}` : `▶ ${r0.label}`))
        .when(going, (e) => e.child(div().flex_none().text_size(11).text_color(t.foreground).child(runningText(live.state))))
        .when(!going, (e) => e.child(pill(t, `kp-run-${pane}`, st0 ? "▶ Again" : "▶ Run", go(`${p.terminal}-${r0.id ?? r0.label}`, [r0]), ORANGE)))
        .when(!going && Boolean(seq0) && r0.step === 1, (e) => e.child(pill(t, `kp-all-${pane}`, `▶ Run all ${seq0.length}`, go(`${p.terminal}-all`, seq0), ORANGE)))
        .when(!going && Boolean(r0.state?.log), (e) => e.child(pill(t, `kp-log-${pane}`, "log", () => openRunLog(p.terminal, r0.state.log, { panes, shared, setShared, run }))))
        .child(pill(t, `kp-cp-${pane}`, this.copied === pane ? "✓ Copied" : "Copy", (_e, cx2) => copyCommand(this, pane, r0.command, cx2)))
        .child(pill(t, `kp-x-run-${pane}`, "✕", () => setShared("kit.runsDismissed", dismissRun(shared("kit.runsDismissed"), shared("herdr-kit")?.agents, p.terminal, r0)), t.dim))
        .when(runs.length > 1, (e) => e.child(div().flex_none().text_size(11).text_color(t.dim).child(`+${runs.length - 1} on the rail`))))
      .when(snoozed, (el) => el.child(div().flex_none().text_size(11).font_semibold().text_color(t.dim).child(snoozeLabel(kit))))
      .when(kind === "done", (el) => el.child(mark("done", false)).when(Boolean(kit.card), (e) => e.child(cardMark(kit.card, BLUE)))
        .when(Boolean(kit.attention.since), (e) => e.child(div().flex_none().text_size(10.5).text_color(t.muted).child(`done ${waited(kit.attention.since)} ago`))))
      // No Run card to show: the closing question it left, so the header says what it wants.
      .when(kind !== "blocked" && !r0 && Boolean(kit?.card) && Boolean(kit?.ask_text), (el) => el
        .child(div().id(`kp-ask-${pane}`).truncate().max_w(360).text_size(11).text_color(kind === "done" ? BLUE : t.foreground).tooltip(kit.ask_text).child(withCard(kit.card, kit.ask_text))))
      .when(this.hovered && tile, (el) => el
        .when(Boolean(kit), snoozeButtons)
        .child(this.textButton(t, `kp-p-${pane}`, pinned ? "unpin" : "⚲ pin", togglePin))
        .child(this.textButton(t, `kp-s-${pane}`, lit ? "▦ grid" : "⤢ spotlight", toggleSpot))
        .child(this.textButton(t, `kp-o-${pane}`, "↗ open", () => {
          setShared("kit.afterView", { view: "focus", address: p.terminal });
          setShared("kit.viewWant", "focus");
        })))
      .when(this.hovered && !tile, (el) => el
        .when(Boolean(kit), snoozeButtons)
        .child(this.button(t, `kp-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `kp-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `kp-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `kp-x-${pane}`, "close", "pane.close", { pane })))
      .child(this.flares.overlay(pane));
  }
}
