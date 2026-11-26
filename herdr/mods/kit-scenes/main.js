// kit-scenes: the scene picker. Opened as a dialog overlay by herdr-signals
// (the global picker key, or the strip's ◐ button). It only draws: the scenes
// come from the shared key "kit.scenes" (herdr-signals publishes them once), and
// a pick sets "kit.sceneWant", which herdr-signals applies to the one kit layout.
// The core scenes are page 1; an overlay's extra scenes, when it adds any, are page 2.
// Dialog and display are separate copies, so only shared keys cross.
import { View, div, image } from "gpui-kit";
import { ScrollHandle, v_flex, h_flex } from "gpui-base";
import { closeOverlay, nextCommand, props, setShared, shared, theme } from "herdr";
import { COLS, GAP, HEADER, LABEL, PAD, ROWS, TILE, gridHeight, pageStep, pickerStart, pickerStep, rowOf, splitPages, tileInputs } from "./picker.js";
import { isLight, useTheme } from "./look.js";

export default class KitScenes extends View {
  init(_props, cx) {
    this.closed = false;
    this.handle = cx.focus_handle();
    this.handle.focus();
    // Built once, here: render only reads these.
    this.scenes = shared("kit.scenes") ?? [];
    const tiles = tileInputs(this.scenes);
    this.pages = splitPages(tiles);
    this.scroll = ScrollHandle.new();
    this.state = pickerStart(tiles, shared("kit.scene") ?? null, isLight(theme()?.background));
    // Scripted keys ("kit-scenes:left" ...), so a test or the deck can drive it.
    cx.spawn(async (acx) => {
      for (;;) {
        const c = await nextCommand();
        if (this.closed) return;
        this.press(c, acx);
      }
    });
  }

  async close() {
    this.closed = true;
    this.scroll?.release();
    this.scroll = null;
  }

  /** The tiles on the page the cursor is on. */
  get tiles() {
    return this.pages[this.state.page] ?? [];
  }

  /** Show another page (the page button, or the p, pagedown and pageup keys). */
  flip(key, cx) {
    const next = pageStep(this.state, key, this.pages);
    if (next === this.state) return;
    this.state = next;
    this.scroll?.scroll_to_item(0);
    cx.notify();
  }

  press(key, cx) {
    if (["p", "pagedown", "pageup"].includes(key)) { this.flip(key, cx); return; }
    const r = pickerStep(this.state, key, this.tiles.map((t) => t.key));
    const moved = r.state.index !== this.state.index;
    this.state = r.state;
    if (moved && this.tiles.length > COLS * ROWS) this.scroll?.scroll_to_item(rowOf(r.state.index));
    if (r.pick) setShared("kit.sceneWant", r.pick);
    if (r.close) { this.closed = true; closeOverlay(props()?.overlay); } else cx.notify();
  }

  key(e, cx) {
    const ks = e.keystroke;
    if (["left", "right", "up", "down", "enter", "escape", "n", "d", ...(this.pages.length > 1 ? ["p", "pagedown", "pageup"] : [])].includes(ks)) {
      this.press(ks, cx);
      cx.stop_propagation();
    }
  }

  tile(t, tl, i, size) {
    const here = i === this.state.index;
    const shown = tl.key === shared("kit.scene");
    const day = this.state.day;
    const needs = day ? tl.needs.light : tl.needs.dark;
    const glyph = tl.glyph;
    const pic = div().relative().flex_none().w(size.w).h(size.h).rounded(8).overflow_hidden()
      .border_2().border_color(here ? t.foreground : shown ? t.muted : t.border)
      .child(image(day ? tl.thumbs.light : tl.thumbs.dark).w(size.w).h(size.h))
      // A word, not a colour: a declined scene says so on its picture's corner, so "shown" and the label keep the row.
      .when(tl.status === "declined", (el) => el.child(div().id(`scene-${tl.key}-declined`).absolute().left(4).top(4).px(4).rounded(3)
        .bg(t.background).text_size(11).text_color(t.foreground).child("declined")));
    return v_flex().id(`scene-${tl.key}`).gap(6).flex_none().w(size.w).cursor_pointer()
      .on_click((_e, cx) => { this.state = { ...this.state, index: i }; this.press("enter", cx); })
      .child(pic)
      .child(h_flex().items_center().gap(6).h(LABEL - 6).text_size(13)
        .child(div().text_color(needs).child(glyph))
        .child(div().flex_1().min_w_0().truncate().text_color(here ? t.foreground : t.muted).child(tl.label))
        .when(shown, (el) => el.child(div().flex_none().text_size(11).text_color(t.muted).child("shown"))));
  }

  mode(t, id, label, day) {
    const on = this.state.day === day;
    return div().id(id).px(8).py(2).rounded(4).text_size(13).cursor_pointer()
      .text_color(on ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { this.state = { ...this.state, day }; cx.notify(); })
      .child(label);
  }

  /**
   * The page button, drawn only with a second page: it says which page this
   * is and where it goes. A Tab stop (Enter or Space count as a click), with a
   * ring that is a shape, not a colour.
   */
  pageButton(t) {
    const n = this.pages.length;
    const here = this.state.page + 1;
    const next = this.pages[(this.state.page + 1) % n] ?? [];
    const goes = next.length && next[0].status !== undefined ? "more scenes" : "core scenes";
    const word = `${goes} ${here < n ? "›" : "‹"}`;
    return h_flex().items_center().gap(8)
      .child(div().text_size(12).text_color(t.dim).child(`page ${here} of ${n}`))
      .child(div().id("scene-page").px(8).py(2).rounded(4).text_size(13).cursor_pointer()
        .text_color(t.foreground).border_1().border_color(t.border)
        .hover((s) => s.bg(t.hover))
        .role("button").accessibility_label(`Scenes page ${here} of ${n}: show ${goes}`).tab_index(0)
        .focus((s) => s.border_2().border_color(t.foreground))
        .on_click((_e, cx) => this.flip("p", cx))
        .child(word));
  }

  render(cx) {
    const t = theme();
    useTheme(t, shared("kit.scene"), shared("kit.tones"));
    const size = { w: TILE.w, h: TILE.h };
    const rows = Math.ceil(this.tiles.length / COLS);
    const grid = v_flex().id("kit-scenes-scroll").h(gridHeight(Math.min(rows, ROWS))).flex_none().gap(GAP).p(PAD)
      .overflow_y_scrollbar().when(this.scroll !== null, (el) => el.track_scroll(this.scroll));
    for (let r = 0; r < rows; r++) {
      grid.child(h_flex().gap(GAP).children(this.tiles.slice(r * COLS, r * COLS + COLS).map((tl, k) => this.tile(t, tl, r * COLS + k, size))));
    }
    const head = h_flex().items_center().gap(6).px(PAD).pt(18).h(HEADER)
      .child(div().flex_1().text_size(20).font_semibold().text_color(t.foreground).child("Scene"))
      .child(div().text_size(12).text_color(t.dim).child(this.pages.length > 1 ? "arrows move · enter picks · p page · esc closes" : "arrows move · enter picks · esc closes"))
      .when(this.pages.length > 1, (el) => el.child(this.pageButton(t)))
      .child(this.mode(t, "mode-night", "☾ night", false))
      .child(this.mode(t, "mode-day", "☀ day", true));
    return v_flex().id("kit-scenes").size_full().min_h(0).bg(t.background)
      .track_focus(this.handle).on_key_down((e, kcx) => this.key(e, kcx))
      .child(head)
      .child(grid);
  }
}
