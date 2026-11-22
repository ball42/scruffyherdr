// kit-scenes: the scene picker. Opened as a dialog overlay by herdr-signals
// (the global picker key, or the strip's ◐ button). It only draws: the scenes
// come from the shared key "kit.scenes" (herdr-signals publishes them once), and
// a pick sets "kit.sceneWant", which herdr-signals applies to the one kit layout.
// Dialog and display are separate copies, so only shared keys cross.
import { View, div, image } from "gpui-kit";
import { ScrollHandle, v_flex, h_flex } from "gpui-base";
import { closeOverlay, nextCommand, props, setShared, shared, theme } from "herdr";
import { COLS, GAP, HEADER, LABEL, PAD, ROWS, TILE, crossInput, crossPress, gridHeight, pickerStart, pickerStep, rowOf, tileInputs } from "./picker.js";
import { isLight, useTheme } from "./look.js";

export default class KitScenes extends View {
  init(_props, cx) {
    this.closed = false;
    this.handle = cx.focus_handle();
    this.handle.focus();
    // Built once, here: render only reads these.
    this.scenes = shared("kit.scenes") ?? [];
    this.tiles = tileInputs(this.scenes);
    this.cross = crossInput(shared("kit.cross"));
    this.scroll = ScrollHandle.new();
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
    this.scroll?.release();
    this.scroll = null;
  }

  press(key, cx) {
    if (key === "c" && this.cross) { this.crossOver(cx); return; }
    const r = pickerStep(this.state, key, this.keys);
    const moved = r.state.index !== this.state.index;
    this.state = r.state;
    if (moved && this.tiles.length > COLS * ROWS) this.scroll?.scroll_to_item(rowOf(r.state.index));
    if (r.pick) setShared("kit.sceneWant", r.pick);
    if (r.close) { this.closed = true; closeOverlay(props()?.overlay); } else cx.notify();
  }

  /** The cross button: ask herdr-signals for the other kit layout, then close. */
  crossOver(cx) {
    const r = crossPress(this.cross);
    if (r.want !== null) setShared("kit.layoutWant", r.want);
    if (r.close) { this.closed = true; closeOverlay(props()?.overlay); } else cx.notify();
  }

  key(e, cx) {
    const ks = e.keystroke;
    if (["left", "right", "up", "down", "enter", "escape", "n", "d", ...(this.cross ? ["c"] : [])].includes(ks)) {
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

  /** The button to the other kit layout, named by its label and drawn only while kit.cross is set. */
  crossButton(t) {
    return div().id("scene-cross").px(8).py(2).rounded(4).text_size(13).cursor_pointer()
      .text_color(t.foreground).border_1().border_color(t.border)
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.crossOver(cx))
      .child(this.cross.label);
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
      .child(div().text_size(12).text_color(t.dim).child(this.cross ? "arrows move · enter picks · c crosses · esc closes" : "arrows move · enter picks · esc closes"))
      .when(this.cross !== null, (el) => el.child(this.crossButton(t)))
      .child(this.mode(t, "mode-night", "☾ night", false))
      .child(this.mode(t, "mode-day", "☀ day", true));
    return v_flex().id("kit-scenes").size_full().min_h(0).bg(t.background)
      .track_focus(this.handle).on_key_down((e, kcx) => this.key(e, kcx))
      .child(head)
      .child(grid);
  }
}
