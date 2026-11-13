// kit-scenes: the scene picker. Opened as a dialog overlay by herdr-signals
// (the global picker key, or the strip's ◐ button). It only draws: the scenes
// come from the shared key "kit.scenes" (herdr-signals publishes them once), and
// a pick sets "kit.sceneWant", which herdr-signals applies to the one kit layout.
// Dialog and display are separate copies, so only shared keys cross.
import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { closeOverlay, nextCommand, props, setShared, shared, theme } from "herdr";
import { COLS, GAP, HEADER, LABEL, PAD, TILE, gridHeight, pickerStart, pickerStep, tileInputs } from "./picker.js";
import { isLight, useTheme } from "./look.js";

export default class KitScenes extends View {
  init(_props, cx) {
    this.closed = false;
    this.handle = cx.focus_handle();
    this.handle.focus();
    // Built once, here: render only reads these.
    this.scenes = shared("kit.scenes") ?? [];
    this.tiles = tileInputs(this.scenes);
    this.keys = this.tiles.map((t) => t.key);
    this.state = pickerStart(this.tiles, shared("kit.scene") ?? null, isLight(theme()?.background));
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
  }

  press(key, cx) {
    const r = pickerStep(this.state, key, this.keys);
    this.state = r.state;
    if (r.pick) setShared("kit.sceneWant", r.pick);
    if (r.close) { this.closed = true; closeOverlay(props()?.overlay); } else cx.notify();
  }

  key(e, cx) {
    const ks = e.keystroke;
    if (["left", "right", "up", "down", "enter", "escape", "n", "d"].includes(ks)) {
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
      .child(image(day ? tl.thumbs.light : tl.thumbs.dark).w(size.w).h(size.h));
    return v_flex().id(`scene-${tl.key}`).gap(6).flex_none().w(size.w).cursor_pointer()
      .on_click((_e, cx) => { this.state = { ...this.state, index: i }; this.press("enter", cx); })
      .child(pic)
      .child(h_flex().items_center().gap(6).h(LABEL - 6).text_size(13)
        .child(div().text_color(needs).child(glyph))
        .child(div().flex_1().text_color(here ? t.foreground : t.muted).child(tl.label))
        .when(shown, (el) => el.child(div().text_size(11).text_color(t.muted).child("shown"))));
  }

  mode(t, id, label, day) {
    const on = this.state.day === day;
    return div().id(id).px(8).py(2).rounded(4).text_size(13).cursor_pointer()
      .text_color(on ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { this.state = { ...this.state, day }; cx.notify(); })
      .child(label);
  }

  render(cx) {
    const t = theme();
    useTheme(t, shared("kit.scene"));
    const size = { w: TILE.w, h: TILE.h };
    const rows = Math.ceil(this.tiles.length / COLS);
    const grid = v_flex().gap(GAP).p(PAD);
    for (let r = 0; r < rows; r++) {
      grid.child(h_flex().gap(GAP).children(this.tiles.slice(r * COLS, r * COLS + COLS).map((tl, k) => this.tile(t, tl, r * COLS + k, size))));
    }
    const head = h_flex().items_center().gap(6).px(PAD).pt(18).h(HEADER)
      .child(div().flex_1().text_size(20).font_semibold().text_color(t.foreground).child("Scene"))
      .child(div().text_size(12).text_color(t.dim).child("arrows move · enter picks · esc closes"))
      .child(this.mode(t, "mode-night", "☾ night", false))
      .child(this.mode(t, "mode-day", "☀ day", true));
    return v_flex().id("kit-scenes").size_full().min_h(0).bg(t.background)
      .track_focus(this.handle).on_key_down((e, kcx) => this.key(e, kcx))
      .child(head)
      .child(div().id("kit-scenes-scroll").h(gridHeight(rows)).flex_none().overflow_y_scrollbar().child(grid));
  }
}
