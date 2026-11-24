// The herdr-signals strip block's id in a kit layout. Herdr keeps one copy of
// a mod per block id across layout switches, and that copy keeps the props it
// started with. When two kit layouts shared the id "signals", the copy started
// on one kept its `layout` prop on the other, disowned it (main.js owns()), and
// left every scene, view and layout request there unhandled. So each kit
// layout's strip gets its own id: "signals" on KIT_LAYOUT (unchanged, so its
// saved sizes and the gallery stay put), "signals-<layout>" on any other. Pure.
import { KIT_LAYOUT } from "./scenes.js";

const BASE = "signals";

/** The strip's id in the kit layout `layout`. */
export function signalsId(layout) {
  return typeof layout === "string" && layout !== "" && layout !== KIT_LAYOUT ? `${BASE}-${layout}` : BASE;
}

/** Whether `id` names a kit layout's strip block. */
export function isSignalsId(id) {
  return typeof id === "string" && (id === BASE || id.startsWith(`${BASE}-`));
}
