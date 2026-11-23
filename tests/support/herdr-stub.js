// Runs an add-on mod's main.js under Node: maps `herdr`, `gpui-kit` and
// `gpui-base` to stubs. The herdr stub's state is `host` (shared values, live
// agents, an exec fake, logs); the clock is `host.now`.
import { registerHooks } from "node:module";

export const host = {
  now: 0,
  shared: {},
  sets: [], // [key, value] in setShared order
  agents: [],
  panes: [],
  overlays: [],
  closed: [],
  notes: [],
  files: {},
  writes: [],
  execs: [], // [command, args]
  exec: async () => ({ code: 0, stdout: "", stderr: "" }),
  openOverlay: null, // a function to replace the default
  layout: null, // the shown layout's tree, for layout()
  layouts: [], // layouts()
  runs: [], // [action, args] for run()
  themeJson: "{}", // theme()
  props: {}, // props()
  badges: [], // each setBadge() text, in call order
  checking: false, // checking()
};

globalThis.__herdrHost = host;

const HERDR = `
const h = globalThis.__herdrHost;
export const home = () => "/home/test";
export const shared = (k) => h.shared[k];
export const setShared = (k, v) => { h.shared[k] = v; h.sets.push([k, v]); return null; };
export const agents = () => h.agents;
export const panes = () => h.panes;
export const exec = (cmd, args) => { h.execs.push([cmd, args]); return h.exec(cmd, args); };
export const readTextFile = async (p) => (p in h.files ? h.files[p] : null);
export const writeTextFile = async (p, text) => { h.files[p] = text; h.writes.push(p); return null; };
export const notify = (n) => { h.notes.push(n); return "n"; };
export const openOverlay = (spec) => { if (h.openOverlay) return h.openOverlay(spec); h.overlays.push(spec); return "ov" + h.overlays.length; };
export const appHome = () => "/app";
export const layout = () => h.layout;
export const layouts = () => h.layouts;
export const run = (a, args) => { h.runs.push([a, args]); if (a === "layout.set") h.layout = args.layout; return null; };
// nextCommand and watchFolder never resolve: main.js loops on them, so a resolving stub would spin. A test that needs a command or a folder event must not rely on them.
export const nextCommand = () => new Promise(() => {});
export const watchFolder = () => new Promise(() => {});
export const focused = () => null;
export const setAgentOrder = () => null;
export const settings = () => ({});
export const spaces = () => [];
export const theme = () => JSON.parse(h.themeJson);
export const props = () => h.props;
export const closeOverlay = (id) => { h.closed.push(id); return null; };
export const setBadge = (text) => { h.badges.push(text); return null; };
export const checking = () => h.checking;
`;

const GPUI = `
export class View {}
// Elements record their builder calls ([name, ...args]) in .calls; when runs its callback when the condition holds.
function el() {
  const calls = [];
  const p = new Proxy({}, { get: (_, k) => {
    if (k === "calls") return calls;
    if (k === "when") return (c, fn) => (c ? fn(p) : p);
    return (...a) => { calls.push([k, ...a]); return p; };
  } });
  return p;
}
export const image = el;
export const ScrollHandle = { new: () => ({ scrolled: [], released: false, scroll_to_item(i) { this.scrolled.push(i); }, release() { this.released = true; return true; } }) };
export const div = el;
export const svg = el;
export const h_flex = el;
export const v_flex = el;
`;

registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "herdr") return { url: "data:text/javascript," + encodeURIComponent(HERDR), shortCircuit: true };
    if (spec === "gpui-kit" || spec === "gpui-base") return { url: "data:text/javascript," + encodeURIComponent(GPUI), shortCircuit: true };
    return next(spec, ctx);
  },
});

/** A fake cx: timers fire as the clock advances; spawned tasks are collected for `settle`. */
export function fakeCx() {
  const timers = [];
  const tasks = [];
  const cx = {
    notify() {},
    spawn(fn) { tasks.push(Promise.resolve().then(() => fn(cx))); return { cancel() {} }; },
    timer: {
      every(ms, fn) { timers.push({ due: host.now + ms, every: ms, fn }); return { cancel() {} }; },
      after(ms, fn) { timers.push({ due: host.now + ms, every: 0, fn }); return { cancel() {} }; },
    },
    /** Lets every spawned task (and the ones they spawn) finish. */
    async settle() {
      for (let i = 0; i < 20; i++) {
        const batch = tasks.splice(0);
        await Promise.all(batch);
        await new Promise((r) => setImmediate(r));
        if (!tasks.length) return;
      }
    },
    async advance(ms) {
      const end = host.now + ms;
      for (;;) {
        const t = timers.filter((x) => x.due <= end).sort((a, b) => a.due - b.due)[0];
        if (!t) break;
        host.now = t.due;
        if (t.every) t.due += t.every; else timers.splice(timers.indexOf(t), 1);
        t.fn(cx);
        await cx.settle();
      }
      host.now = end;
    },
  };
  return cx;
}

/** Resets the host for a fresh mod start. */
export function resetHost() {
  Object.assign(host, {
    now: 1_000_000, shared: {}, sets: [], agents: [], panes: [], overlays: [], closed: [], notes: [], files: {}, writes: [], execs: [],
    exec: async () => ({ code: 0, stdout: "", stderr: "" }), openOverlay: null, layout: null, layouts: [], runs: [], themeJson: "{}", badges: [], checking: false,
  });
}
