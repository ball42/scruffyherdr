// A space's README, rendered as markdown. herdr-signals opens it as a space's
// first tab (readme.js), so a space with no terminal or Claude left shows it.
// Props: { file } (absolute path). Re-reads every few seconds, so edits show.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { home, props, readTextFile, theme } from "herdr";

const RELOAD_MS = 3000;

function tilde(path) {
  const h = home();
  return path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

export default class KitReadme extends View {
  init(_props, cx) {
    this.text = null;
    this.missing = false;
    const load = () => cx.spawn(async (cx) => {
      const file = props()?.file;
      const text = file ? await readTextFile(file).catch(() => null) : null;
      const missing = text == null;
      if (text !== this.text || missing !== this.missing) {
        this.text = text;
        this.missing = missing;
        cx.notify();
      }
    });
    load();
    cx.timer.every(RELOAD_MS, load);
  }

  render() {
    const t = theme();
    const file = props()?.file ?? "";
    const body = this.missing
      ? div().text_color(t.dim).child(file ? `No README at ${tilde(file)}` : "No README file given.")
      : TextView.markdown("kit-readme-body", this.text ?? "").selectable(true);
    return v_flex().id("kit-readme").size_full().min_h(0).bg(t.background)
      .child(h_flex().flex_none().h(28).px(16).items_center().border_b(1).border_color(t.border)
        .text_size(11.5).text_color(t.dim).child(tilde(file)))
      .child(div().id("kit-readme-scroll").flex_1().min_h(0).overflow_y_scrollbar()
        .child(div().max_w(860).px(28).py(20).text_size(13.5).text_color(t.foreground).child(body)));
  }
}
