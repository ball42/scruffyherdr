// Lets Node import a kit look.js: maps Herdr's gpui modules to a stub whose
// elements record every builder call.
import { registerHooks } from "node:module";

const STUB = `
function el() {
  const calls = [];
  const p = new Proxy({}, { get: (_, k) => k === "calls" ? calls : (...a) => { calls.push([k, ...a]); return p; } });
  return p;
}
export const div = el;
export const h_flex = el;
export const v_flex = el;
export const svg = (path) => el().svg_path(path);
`;

registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "gpui-kit" || spec === "gpui-base") {
      return { url: "data:text/javascript," + encodeURIComponent(STUB), shortCircuit: true };
    }
    return next(spec, ctx);
  },
});

/** A fake cx: timers run only when the test advances the clock. */
export function fakeCx() {
  let now = 0;
  const timers = [];
  const cx = {
    notifies: 0,
    notify() { cx.notifies++; },
    timer: {
      after(ms, fn) { const t = { due: now + ms, fn, every: 0, live: true }; timers.push(t); return task(t); },
      every(ms, fn) { const t = { due: now + ms, fn, every: ms, live: true }; timers.push(t); return task(t); },
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const t = timers.filter((x) => x.live && x.due <= end).sort((a, b) => a.due - b.due)[0];
        if (!t) break;
        now = t.due;
        if (t.every) t.due += t.every; else t.live = false;
        t.fn(cx);
      }
      now = end;
    },
    live() { return timers.filter((x) => x.live).length; },
  };
  return cx;
}

function task(t) { return { cancel() { t.live = false; }, is_done() { return !t.live; } }; }
