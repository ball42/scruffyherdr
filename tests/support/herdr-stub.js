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
export const closeOverlay = (id) => { h.closed.push(id); return null; };
`;

const GPUI = `
export class View {}
function el() {
  const p = new Proxy({}, { get: () => () => p });
  return p;
}
export const div = el;
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
    exec: async () => ({ code: 0, stdout: "", stderr: "" }), openOverlay: null,
  });
}
