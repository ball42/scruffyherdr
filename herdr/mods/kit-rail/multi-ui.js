// The controller behind the multi-reply bar: owns the selection (shared key
// kit.multi), the reply field and the in-flight run. Pure parts: multi.js.
import { Input, InputState } from "gpui-base";
import { setShared, shared } from "herdr";
import { hcPlain } from "./expand.js";
import { promptKey, sendReply } from "./answer.js";
import { buildQueue, canTick, multiBar, pruneSelection, resultChip, runQueue, tickBox, toggleSelection } from "./multi.js";

const RESULTS_FOR = 8000; // ms the per-card results stay after a run

export class MultiReply {
  constructor() {
    this.keys = {};      // address -> promptKey when ticked
    this.results = {};   // address -> "sending" | "sent" | "stuck" | "failed" | "changed"
    this.running = null; // {done, total} while a run is going
    this.field = InputState.new({ placeholder: "Reply to all selected…" });
    this.text = "";
    this.field.on("change", (_e, cx) => { this.text = this.field.value(); cx.notify(); });
    this.field.on("submit", (_e, cx) => this.send(null, cx));
  }

  agents() {
    return shared("herdr-kit")?.agents ?? [];
  }

  selected() {
    const s = shared("kit.multi");
    return Array.isArray(s) ? s : [];
  }

  has(address) {
    return this.selected().includes(address);
  }

  /** Whether a card shows its tick box: hovered or ticked, and only a card that can be ticked. */
  showTick(a, hovered) {
    return canTick(a) && (hovered === a.address || this.has(a.address));
  }

  tick(a, t) {
    return tickBox(t, a.address, this.has(a.address), (_addr, cx) => this.toggle(a, cx));
  }

  chip(a, t) {
    const r = this.results[a.address];
    return r ? resultChip(t, a.address, r) : null;
  }

  toggle(a, cx) {
    if (this.running || !canTick(a)) return;
    const sel = toggleSelection(this.selected(), a.address);
    if (sel.includes(a.address)) this.keys[a.address] = promptKey(a);
    else delete this.keys[a.address];
    setShared("kit.multi", sel);
    cx.notify();
  }

  clear(cx) {
    if (this.running) return;
    this.keys = {};
    if (this.selected().length) setShared("kit.multi", []);
    this.field.set_value("");
    this.text = "";
    cx.notify();
  }

  /** Drops ticked Claudes that left done or idle or vanished (not mid-run). */
  sync(agents, cx) {
    if (this.running) return;
    const p = pruneSelection(shared("kit.multi"), agents);
    if (!p.changed) return;
    cx.timer.after(0, (acx) => {
      if (this.running) return;
      const again = pruneSelection(shared("kit.multi"), this.agents());
      if (again.changed) setShared("kit.multi", again.sel);
      for (const k of Object.keys(this.keys)) if (!again.sel.includes(k)) delete this.keys[k];
      acx.notify();
    });
  }

  /** Esc clears the selection. True when it did. */
  key(e, cx, cardOpen) {
    if (e.keystroke !== "escape" || cardOpen || this.running || !this.selected().length) return false;
    this.clear(cx);
    cx.stop_propagation();
    return true;
  }

  /** Sends `quick` (a button's word) or the typed text to every ticked Claude, one at a time. */
  send(quick, cx) {
    const text = String(quick ?? this.field.value()).trim();
    const sel = this.selected();
    if (this.running || sel.length < 2 || !text) return;
    const queue = buildQueue(sel, this.agents(), this.keys);
    this.results = {};
    this.running = { done: 0, total: queue.length };
    cx.notify();
    cx.spawn(async (acx) => {
      const h = { hc: hcPlain, sleep: (ms) => new Promise((done) => acx.timer.after(ms, () => done())) };
      await runQueue({
        queue, text, agents: () => this.agents(), send: (address) => sendReply(address, text, h),
        onResult: (r) => {
          this.results = r;
          this.running = { done: Object.values(r).filter((v) => v !== "sending").length, total: queue.length };
          acx.notify();
        },
      });
      this.running = null;
      this.keys = {};
      setShared("kit.multi", []);
      this.field.set_value("");
      this.text = "";
      const mine = this.results;
      acx.timer.after(RESULTS_FOR, (bcx) => { if (this.results === mine) { this.results = {}; bcx.notify(); } });
      acx.notify();
    });
  }

  bar(t) {
    const n = this.selected().length;
    if (n < 2) return null;
    return multiBar(t, {
      n, field: Input.new(this.field), running: this.running, hasText: Boolean(this.text.trim()),
      send: (q, cx) => this.send(q, cx), clear: (cx) => this.clear(cx),
    });
  }
}
