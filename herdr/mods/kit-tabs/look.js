// Shared look for the herdr-kit focus view: twin suns (Tatooine) or a tree
// with fireflies (Endor) for "needs you",
// a blue check for "done", and a one-time flare when a Claude newly blocks.
// Colors are never the only cue: every state also has a glyph.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";

// Each scene's needs-you glyph and its state colors in a dark and a light
// tone of the same hue, so "needs you" keeps its hue and "done" stays blue on
// either theme. Not taken from the theme: a preset could make them red and
// green. `orange` is the needs-you color (desert orange on Tatooine, firefly
// gold on Endor), always warm against the blue so they stay apart for
// colour-blind eyes. The keys are the kit scenes, in herdr-signals/scenes.js's
// order (a mod can't import another's files; tests/scenes.test.js checks they match).
export const TONES = {
  tatooine: {
    glyph: "suns",
    dark: { orange: "#ec8e2c", blue: "#58a6ff", sun: "#f6c15b", count: "#f6c15b", badge: "#3a2a14", ink: "#0d1117" },
    light: { orange: "#b35900", blue: "#0969da", sun: "#e8a35a", count: "#8a4600", badge: "#fff1e5", ink: "#ffffff" },
  },
  endor: {
    glyph: "fireflies",
    dark: { orange: "#f2c14e", blue: "#58a6ff", sun: "#fff0a8", tree: "#7fd4b0", count: "#f2c14e", badge: "#25280f", ink: "#0d1117" },
    light: { orange: "#8a6400", blue: "#0969da", sun: "#d9a521", tree: "#2f7a5c", count: "#6e5000", badge: "#fbf3d6", ink: "#ffffff" },
  },
  hoth: {
    glyph: "beacon",
    dark: { orange: "#ff9e7a", blue: "#58a6ff", sun: "#ffd1bd", flake: "#b5e3ff", count: "#ff9e7a", badge: "#33221f", ink: "#0d1117" },
    light: { orange: "#b4542f", blue: "#0969da", sun: "#e8896a", flake: "#2f6fb0", count: "#943f1f", badge: "#fdece6", ink: "#ffffff" },
  },
  dagobah: {
    glyph: "rocks",
    dark: { orange: "#f0b45a", blue: "#58a6ff", sun: "#fff0c0", stone: "#9fab8c", count: "#f0b45a", badge: "#2a2414", ink: "#0d1117" },
    light: { orange: "#9a5a00", blue: "#0969da", sun: "#d99a3a", stone: "#5b6849", count: "#7e4a00", badge: "#f8efdc", ink: "#ffffff" },
  },
  coruscant: {
    glyph: "skyline",
    dark: { orange: "#ffb347", blue: "#58a6ff", sun: "#ffe0a8", towers: "#c8a6ff", count: "#ffb347", badge: "#2e2214", ink: "#0d1117" },
    light: { orange: "#a85a00", blue: "#0969da", sun: "#e09a40", towers: "#6a3fb0", count: "#8a4a00", badge: "#fbefe0", ink: "#ffffff" },
  },
  bespin: {
    glyph: "cloudCity",
    dark: { orange: "#ffcf5c", blue: "#58a6ff", sun: "#ffe2d6", city: "#ffb59e", count: "#ffcf5c", badge: "#2e2618", ink: "#0d1117" },
    light: { orange: "#946200", blue: "#0969da", sun: "#e7c3c9", city: "#a0466a", count: "#7a5000", badge: "#fbf0dc", ink: "#ffffff" },
  },
  naboo: {
    glyph: "palace",
    dark: { orange: "#ffab66", blue: "#58a6ff", sun: "#ffe4c4", palace: "#c8d2e6", count: "#ffab66", badge: "#33241a", ink: "#0d1117" },
    light: { orange: "#a3520c", blue: "#0969da", sun: "#e0a060", palace: "#4f6680", count: "#8a4208", badge: "#fbeee0", ink: "#ffffff" },
  },
  scarif: {
    glyph: "lagoon",
    dark: { orange: "#ff9a3c", blue: "#58a6ff", sun: "#ffe0b0", palm: "#7fd0b0", tower: "#a8b8cc", count: "#ff9a3c", badge: "#33220f", ink: "#0d1117" },
    light: { orange: "#a14a00", blue: "#0969da", sun: "#d08a40", palm: "#1f7a5a", tower: "#5a6a80", count: "#8a3f00", badge: "#fdeedd", ink: "#ffffff" },
  },
  kamino: {
    glyph: "storm",
    dark: { orange: "#ffb84a", blue: "#58a6ff", sun: "#bcdcec", pod: "#a8bccc", count: "#ffb84a", badge: "#30240f", ink: "#0d1117" },
    light: { orange: "#9a5800", blue: "#0969da", sun: "#5a8aa8", pod: "#4e6070", count: "#7e4800", badge: "#fbf0dc", ink: "#ffffff" },
  },
  "small-moon": {
    glyph: "layered",
    dark: { orange: "#ff8a3d", blue: "#58a6ff", sun: "#ffd6b0", body: "#b4bcc8", count: "#ff8a3d", badge: "#331f10", ink: "#0d1117" },
    light: { orange: "#a24800", blue: "#0969da", sun: "#c98a5a", body: "#5a6474", count: "#8a3c00", badge: "#fdeedf", ink: "#ffffff" },
  },
};
/** The tree behind Endor's fireflies, tinted with the text color. */
export const TREE_SVG = "mods/kit-rail/tree.svg";
/** Dagobah's cairn and its lifted stone, tinted with the text color. */
export const CAIRN_SVG = "mods/kit-rail/cairn.svg";
export const ROCK_SVG = "mods/kit-rail/rock.svg";
/** Coruscant's towers, tinted with the text color. */
export const TOWERS_SVG = "mods/kit-rail/towers.svg";
/** Bespin's floating city, tinted with the text color. */
export const CLOUD_CITY_SVG = "mods/kit-rail/cloud-city.svg";
/** Naboo's domed palace, tinted with the text color. */
export const PALACE_SVG = "mods/kit-rail/palace.svg";
/** Scarif's palm, tinted with the text color. */
export const PALM_SVG = "mods/kit-rail/palm.svg";
/** Kamino's stilt pod, tinted with the text color. */
export const POD_SVG = "mods/kit-rail/pod.svg";
/**
 * A scene's glyph drawn from layer files in Herdr's home, not from code:
 * `glyphs/<scene>-body.svg`, `-edge.svg`, `-light.svg` and `-mover.svg`, each a 14 by 14
 * one-colour SVG. install.sh links herdr/glyphs/ there per file, and an
 * overlay can link its own over them (as it does scene pictures).
 */
export function glyphLayers(sceneKey) {
  const at = (layer) => `glyphs/${sceneKey}-${layer}.svg`;
  return { body: at("body"), edge: at("edge"), light: at("light"), mover: at("mover") };
}
/** Hoth's snowflake, tinted with the text color. */
export const FLAKE_SVG = "mods/kit-rail/snowflake.svg";
// Live bindings: useTheme() swaps them, and importers see the new values.
export let ORANGE = TONES.tatooine.dark.orange;
export let BLUE = TONES.tatooine.dark.blue;
/** Text on an ORANGE fill. */
export let INK = TONES.tatooine.dark.ink;
let tone = TONES.tatooine.dark;
let scene = "tatooine";

/** Whether a `#rrggbb` background is light (luminance over half). */
export function isLight(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex ?? "");
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

/**
 * Pick the tone for theme `t` (from theme()) in scene `sceneKey` (shared
 * "kit.scene"): its scene's, Tatooine's for an unknown key or null. Nothing is
 * cached across calls, so a scene change shows on the next render.
 */
export function useTheme(t, sceneKey = null) {
  scene = Object.hasOwn(TONES, sceneKey) ? sceneKey : "tatooine";
  const tones = TONES[scene] ?? TONES.tatooine;
  tone = isLight(t?.background) ? tones.light : tones.dark;
  ORANGE = tone.orange; BLUE = tone.blue; INK = tone.ink;
}
// The flare rises in 120 ms, so hold long enough to reach full strength.
const FLARE_HOLD = 450;
// While a Claude stays blocked and unseen, flare again after each of these
// gaps in turn; the last one repeats.
export const FLARE_EVERY = [15_000, 30_000, 60_000];

/** How long ago `since` (epoch ms) was: "12s", "4m", "1h 5m". */
export function waited(since, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - since) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

/** The snooze choices the rail and the pane header offer: [choice, label]. */
export const SNOOZE_CHOICES = [["15m", "zz 15m"], ["1h", "1h"], ["done", "till done"]];

/**
 * `kit.snooze` with `address` snoozed by `choice` ("15m", "1h", "done"), or
 * woken (null). A new choice replaces the old one. herdr-signals/snooze.js
 * reads the shapes written here.
 */
export function snoozeSet(snooze, address, choice, now = Date.now()) {
  const next = { ...(snooze ?? {}) };
  delete next[address];
  if (choice === "15m") next[address] = now + 15 * 60_000;
  else if (choice === "1h") next[address] = now + 60 * 60_000;
  else if (choice === "done") next[address] = { done: now };
  return next;
}

/** "zz 42m" / "zz 1h 5m" / "zz till done" for a snoozed model row, else null. */
export function snoozeLabel(a, now = Date.now()) {
  if (!a?.snoozed) return null;
  if (a.snooze_focus) return "◎ focus";
  if (a.snooze_till_done) return "zz till done";
  if (typeof a.snooze_until !== "number") return "zz";
  const m = Math.max(1, Math.ceil((a.snooze_until - now) / 60_000));
  if (m < 60) return `zz ${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `zz ${h}h ${m % 60}m` : `zz ${h}h`;
}

// Context meter thresholds, in % of context left.
const CTX_LOW = 30;      // brighter fill, figure shown: worth a /clear soon
const CTX_CRITICAL = 15; // bold figure: compaction is close

/**
 * The context meter for `left` (whole % of context left, from the status
 * line): `used` (0-100, the fill), `tone` ("calm", "low", "critical") and
 * `figure` ("18%", only once low). Null when there's no data.
 */
export function ctxMeter(left) {
  if (typeof left !== "number" || !Number.isFinite(left)) return null;
  const l = Math.min(100, Math.max(0, Math.round(left)));
  const tone = l <= CTX_CRITICAL ? "critical" : l <= CTX_LOW ? "low" : "calm";
  return { used: 100 - l, tone, figure: tone === "calm" ? null : `${l}%` };
}

/**
 * True when a Claude is sitting at a prompt (done or idle) with context
 * critical, so "/compact" can be typed for it. Never while it works or waits
 * on a question, and never for a remote one (no hc path to it).
 */
export function canCompact(a) {
  if (!a || (a.status !== "done" && a.status !== "idle")) return false;
  if (String(a.address).includes("/")) return false;
  return ctxMeter(a.ctx_left)?.tone === "critical";
}

/** The "⟲ compact" pill, or "sending…" in its place while the send runs. `act` is its click. */
export function compactPill(t, a, sending, act) {
  if (sending) return div().flex_none().text_size(11).text_color(t.muted).child("sending…");
  return pill(t, `rail-compact-${a.address}`, "⟲ compact", act);
}

/**
 * A 3px bar along the bottom edge of a card (its parent must be relative),
 * inset by `inset` px so it clears the card's rounded corners. Weight, not
 * hue: grey fill, foreground once low, so it never reads as orange (needs
 * you) or blue (done).
 */
export function ctxEdge(m, t, inset = 6) {
  if (!m) return null;
  const fill = m.tone === "calm" ? t.muted : t.foreground;
  const bar = div().absolute().left(inset).right(inset).bottom_0().h(3).rounded(2)
    .child(div().absolute().inset_0().rounded(2).bg(t.muted).opacity(0.2));
  return m.used > 0 ? bar.child(div().absolute().left_0().top_0().bottom_0().w(`${m.used}%`).rounded(2).bg(fill)) : bar;
}

/** The "18%" beside the name once context is low (bold when critical), else null. */
export function ctxFigure(m, t) {
  if (!m?.figure) return null;
  const el = div().flex_none().text_size(10.5).child(m.figure);
  return m.tone === "critical" ? el.font_bold().text_color(t.foreground) : el.text_color(t.muted);
}

/** What a waiting Claude needs: run a command, make a decision, answer a question. */
const CARD_GLYPHS = { run: "▶", decide: "◆", ask: "?" };

/** The glyph for a card kind, or null. */
export function cardGlyph(card) {
  return Object.prototype.hasOwnProperty.call(CARD_GLYPHS, card) ? CARD_GLYPHS[card] : null;
}

/** `text` with the card glyph in front; unchanged without a card. */
export function withCard(card, text) {
  const g = cardGlyph(card);
  return g ? `${g} ${text}` : text;
}

/** The card glyph as a small bold mark in `color`, or null. */
export function cardMark(card, color) {
  const g = cardGlyph(card);
  return g ? div().flex_none().text_size(12).font_semibold().text_color(color).child(g) : null;
}

/** The "asleep" glyph shown on a snoozed Claude, or its snoozeLabel ("zz 42m"). */
export function snoozeGlyph(color, label = "zz") {
  return div().flex_none().text_size(11).font_semibold().text_color(color).child(label ?? "zz");
}

/** Snooze pills for a Claude's row: the three choices, or "wake" while snoozed. */
export function snoozeControls(t, id, a, pick) {
  const row = h_flex().flex_none().gap(4).items_center();
  if (a?.snoozed && !a.snooze_focus) return row.child(pill(t, `${id}-wake`, "wake", () => pick(null), t.dim));
  return row.children(SNOOZE_CHOICES.map(([c, label]) => pill(t, `${id}-${c}`, label, () => pick(c), t.dim)));
}

/** The needs-you glyph of the shown scene (TONES[scene].glyph); breathes only while unseen. */
export function needsGlyph(pulse) {
  return (GLYPHS[TONES[scene]?.glyph] ?? suns)(pulse);
}

/** Tatooine's twin suns, 11px and 7px. */
export function suns(pulse) {
  const el = h_flex().flex_none().items_end().gap(1)
    .child(div().size(11).rounded(6).bg(ORANGE))
    .child(div().size(7).rounded(4).bg(tone.sun));
  return pulse ? el.loop("opacity", { from: 0.55, to: 1, period: 1800 }) : el;
}

/** A small fir with three fireflies around it; only the fireflies breathe, each at its own pace. */
export function fireflies(pulse) {
  const fly = (size, left, top, color, period) => {
    const dot = div().absolute().left(left).top(top).size(size).rounded(size).bg(color);
    return pulse ? dot.loop("opacity", { from: 0.35, to: 1, period }) : dot;
  };
  return div().relative().flex_none().w(16).h(13)
    .child(svg(TREE_SVG).absolute().left(3).top(0).w(9).h(13).text_color(tone.tree))
    .child(fly(4, 11, 1, ORANGE, 1700))
    .child(fly(3, 0, 3, ORANGE, 2300))
    .child(fly(3, 12, 9, tone.sun, 1900));
}

/** Hoth: a snowflake with a signal beacon at its shoulder; only the beacon pulses. */
export function beacon(pulse) {
  const light = div().absolute().left(11).top(0).size(5).rounded(5).bg(ORANGE);
  return div().relative().flex_none().w(16).h(14)
    .child(svg(FLAKE_SVG).absolute().left(0).top(1).size(13).text_color(tone.flake))
    .child(div().absolute().left(10).top(-1).size(7).rounded(7).bg(tone.sun).opacity(pulse ? 0.45 : 0.25))
    .child(pulse ? light.loop("opacity", { from: 0.3, to: 1, period: 1400 }) : light);
}

/** Dagobah: a stone lifted off the cairn, in the needs-you colour. It rises while unseen. */
export function rocks(pulse) {
  const rock = svg(ROCK_SVG).absolute().left(3).top(0).w(8).h(5).text_color(ORANGE);
  return div().relative().flex_none().w(16).h(14)
    .child(svg(CAIRN_SVG).absolute().left(1).top(0).w(12).h(14).text_color(tone.stone))
    .child(pulse ? rock.loop("top", { from: 1.5, to: 0, period: 2400 }) : rock);
}

/** Coruscant: three towers, a warning light blinking on the tallest and a speeder crossing while unseen. */
export function skyline(pulse) {
  const beacon = div().absolute().left(5).top(-2).size(4).rounded(4).bg(ORANGE);
  const speeder = div().absolute().left(0).top(5).w(4).h(2).rounded(1).bg(tone.sun);
  return div().relative().flex_none().w(16).h(14)
    .child(svg(TOWERS_SVG).absolute().left(1).top(0).size(14).text_color(tone.towers))
    .child(pulse ? beacon.loop("opacity", { from: 0.2, to: 1, period: 1200 }) : beacon)
    .child(pulse ? speeder.loop("left", { from: -2, to: 14, period: 2400 }) : speeder.opacity(0));
}

/** Bespin: the floating city on its stalk, a landing light pulsing and a cloud drifting past while unseen. */
export function cloudCity(pulse) {
  const light = div().absolute().left(6).top(-2).size(4).rounded(4).bg(ORANGE);
  const cloud = div().absolute().left(9).top(9).w(7).h(3).rounded(2).bg(tone.sun);
  return div().relative().flex_none().w(16).h(14)
    .child(svg(CLOUD_CITY_SVG).absolute().left(1).top(0).size(14).text_color(tone.city))
    .child(pulse ? light.loop("opacity", { from: 0.3, to: 1, period: 1600 }) : light)
    .child(pulse ? cloud.loop("left", { from: 10, to: -1, period: 4200 }) : cloud);
}

/** Naboo: the domed palace under a moon, its great window glowing and a fall of water running while unseen. */
export function palace(pulse) {
  const window_ = div().absolute().left(6).top(7).size(3).rounded(1).bg(ORANGE);
  const water = div().absolute().left(2).top(11).w(1).h(3).bg(tone.sun);
  return div().relative().flex_none().w(16).h(14)
    .child(svg(PALACE_SVG).absolute().left(0).top(0).size(14).text_color(tone.palace))
    .child(div().absolute().left(13).top(-1).size(3).rounded(3).bg(tone.sun))
    .child(pulse ? window_.loop("opacity", { from: 0.35, to: 1, period: 1500 }) : window_)
    .child(pulse ? water.loop("top", { from: 10, to: 13, period: 900 }).loop("opacity", { from: 1, to: 0.2, period: 900 }) : water.opacity(0));
}

/** Scarif: a palm beside the citadel tower, its beacon pulsing and a swell of surf rolling in while unseen. */
export function lagoon(pulse) {
  const light = div().absolute().left(12).top(0).size(4).rounded(4).bg(ORANGE);
  const surf = div().absolute().left(0).top(12).w(5).h(2).rounded(1).bg(tone.sun);
  return div().relative().flex_none().w(16).h(14)
    .child(svg(PALM_SVG).absolute().left(0).top(0).size(13).text_color(tone.palm))
    .child(div().absolute().left(13).top(3).w(2).h(11).bg(tone.tower))
    .child(pulse ? light.loop("opacity", { from: 0.25, to: 1, period: 1300 }) : light)
    .child(pulse ? surf.loop("left", { from: -2, to: 8, period: 2800 }).loop("opacity", { from: 1, to: 0.2, period: 2800 }) : surf.opacity(0));
}

/** Kamino: a domed pod on its piers, its window band glowing and rain falling past while unseen. */
export function storm(pulse) {
  const band = div().absolute().left(3).top(7).w(8).h(2).rounded(1).bg(ORANGE);
  const drop = div().absolute().left(14).top(0).w(1).h(3).bg(tone.sun);
  return div().relative().flex_none().w(16).h(14)
    .child(svg(POD_SVG).absolute().left(0).top(0).size(14).text_color(tone.pod))
    .child(pulse ? band.loop("opacity", { from: 0.3, to: 1, period: 1400 }) : band)
    .child(pulse ? drop.loop("top", { from: -1, to: 12, period: 700 }) : drop.opacity(0));
}

/**
 * The shown scene's glyph from its layer files (glyphLayers): the body in the
 * scene's body tone, and while unseen the light (in the needs-you colour, over
 * its edge in the ink tone, which sits near the page's own colour so the light
 * stands off the body on either theme) pulses and the mover (in the sun tone)
 * crosses left to right. Seen, the light holds and the mover hides. Small Moon
 * draws this way.
 */
export function layered(pulse) {
  const files = glyphLayers(scene);
  const layer = (file, color) => svg(file).absolute().left(0).top(0).size(14).text_color(color);
  const light = div().absolute().left(0).top(0).size(14)
    .child(layer(files.edge, INK))
    .child(layer(files.light, ORANGE));
  const mover = layer(files.mover, tone.sun);
  return div().relative().flex_none().w(16).h(14)
    .child(layer(files.body, tone.body))
    .child(pulse ? light.loop("opacity", { from: 0.3, to: 1, period: 1500 }) : light)
    .child(pulse ? mover.loop("left", { from: -1, to: 13, period: 2000 }) : mover.opacity(0));
}

const GLYPHS = { suns, fireflies, beacon, rocks, skyline, cloudCity, palace, lagoon, storm, layered };

/**
 * The needs-you glyph in sand with the open-item count; hover lists every open
 * card: the decision, each Run label and each Ask. Fades once left 30 minutes.
 * On a blocked Claude it stands in for the attention glyph, so it pulses while
 * unseen (`pulse`); otherwise it stays still: the reply is already on screen.
 */
export function asksBadge(items, stale = false, pulse = false) {
  return h_flex().flex_none().items_center().gap(4).px(5).py(1).rounded(4)
    .tooltip([...items, ...(stale ? ["Unanswered for 30+ minutes"] : [])].join("\n"))
    .bg(tone.badge).opacity(stale ? 0.45 : 1)
    .accessibility_label(`${items.length} open ${items.length === 1 ? "item" : "items"}`)
    .child(needsGlyph(pulse))
    .child(div().text_size(10.5).font_semibold().text_color(tone.count).child(String(items.length)));
}

/** A Claude's open cards as hover lines, decision first. A run that went clean is closed. */
export function openItems(a) {
  return [
    ...(a.card === "decide" && a.ask ? [`◆ ${a.ask}`] : []),
    ...(a.runs ?? []).filter((r) => !(r.state?.state === "done" && r.state.exit === 0)).map((r) => `▶ ${r.label}`),
    ...(a.asks ?? []).map((q) => `? ${q}`),
  ];
}

/** The glyph for an attention kind, or null. */
export function mark(kind, pulse) {
  if (kind === "blocked") return needsGlyph(pulse);
  if (kind === "done") return div().flex_none().text_size(12).font_semibold().text_color(BLUE).child("✓");
  return null;
}

/**
 * The attention kind a tab shows: herdr-kit's own when it has one, else the
 * tab's Herdr status when that is blocked or done (a tab herdr-kit hasn't
 * modelled yet), so every state gets a glyph, never a bare coloured dot.
 */
export function tabKind(kitKind, status) {
  if (kitKind) return kitKind;
  return status === "blocked" || status === "done" ? status : null;
}

/** Orange 2px for blocked, blue 1px for done, the theme border otherwise. */
export function outline(el, kind, t) {
  if (kind === "blocked") return el.border(2).border_color(ORANGE);
  if (kind === "done") return el.border(1).border_color(BLUE);
  return el.border(1).border_color(t.border);
}

/**
 * Flares a Claude once when it newly blocks, then again every FLARE_EVERY ms
 * while it stays blocked and unseen (the same `pulse` that keeps the suns
 * breathing). The first render records what is already blocked without
 * flaring it at once; those still re-flare.
 */
export class Flares {
  constructor() { this.seen = {}; this.lit = {}; this.clocks = {}; this.primed = false; }

  /** Call once per render with [{key, kind, since, pulse, snoozed}]. */
  update(items, cx) {
    const want = {};
    for (const it of items) {
      if (it.kind !== "blocked") continue;
      if (it.snoozed) { this.seen[it.key] = it.since; continue; }
      if (it.pulse) want[it.key] = it.since;
      if (this.seen[it.key] === it.since) continue;
      this.seen[it.key] = it.since;
      if (this.primed) this.flash(it.key, cx, false);
    }
    for (const key of Object.keys(this.clocks)) {
      if (this.clocks[key].since !== want[key]) { this.clocks[key].task.cancel(); delete this.clocks[key]; }
    }
    for (const [key, since] of Object.entries(want)) {
      if (!this.clocks[key]) { this.clocks[key] = { since }; this.arm(key, 0, cx); }
    }
    this.primed = true;
  }

  /** Schedules re-flare number `n` for `key`; each one schedules the next. */
  arm(key, n, cx) {
    const clock = this.clocks[key];
    clock.task = cx.timer.after(FLARE_EVERY[Math.min(n, FLARE_EVERY.length - 1)], (acx) => {
      this.flash(key, acx);
      this.arm(key, n + 1, acx);
    });
  }

  /** Lights one overlay, then lets it fade. Inside a render, skip notify. */
  flash(key, cx, notify = true) {
    this.lit[key] = true;
    if (notify) cx.notify();
    cx.timer.after(FLARE_HOLD, (acx) => { this.lit[key] = false; acx.notify(); });
  }

  /**
   * An overlay that snaps to orange, holds, then fades; put it in a relative
   * parent. A transition animates the next target change with the policy on
   * the element at that render, so rise and fade each get their own speed.
   */
  overlay(key) {
    const lit = !!this.lit[key];
    return div().id(`flare-${key}`).absolute().inset_0().rounded(6).bg(ORANGE)
      .opacity(lit ? 0.7 : 0)
      .transition("opacity", lit ? { duration: 120, easing: "ease-out" } : { duration: 1200, easing: "ease-in" });
  }
}

/**
 * What clicking a Claude's card or chip does. `g` is {view, space,
 * spotlight, tiles} from shared state. In the focus view, open the grid on
 * that Claude. In the grid, a Claude of the current space swaps into the
 * spotlight unless it already has a tile to focus.
 * Returns {grid: address}, {focus: address} or {spotlight: address}.
 */
export function cardClick(address, space, g) {
  if (g?.view !== "grid") return { grid: address };
  if (space !== g.space) return { focus: address };
  if (!g.spotlight && (g.tiles ?? []).includes(address)) return { focus: address };
  return { spotlight: address };
}

/** `s` as one single-quoted shell word. */
export function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

const QUIET = [
  /^cd(?:\s|$)/,
  /^open\s/,
  /^gh\s+browse(?:\s|$)/,
  /^gh\s.*\s(?:--web|-w)(?:\s|$)/,
];

/**
 * True when every command in the block only changes folder or opens
 * something (open <file|url>, gh ... --web, gh browse): a run with no output
 * worth reading. Comment lines are ignored, backslash continuations joined,
 * and && / ; chains checked part by part. A pipe or redirect is never quiet.
 */
export function isQuietCommand(command) {
  const joined = String(command ?? "").replace(/\\\n/g, " ");
  const parts = joined.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .flatMap((l) => l.split(/\s*(?:&&|;)\s*/)).filter(Boolean);
  return parts.length > 0 && parts.every((p) => QUIET.some((re) => re.test(`${p} `)) && !/[|>]/.test(p));
}

/** What the Run terminal types into its Claude when it ends. */
export const RUN_NOTE = "[herdr-kit] ▶ Run";

const oneLine = (s) => String(s ?? "").replace(/[\r\n]+/g, " ");

/** A Run card label as a filename word: "run-merge-the-harness". */
export function runSlug(label) {
  const w = oneLine(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return w ? `run-${w}` : "run";
}

/**
 * The argv that runs Run cards: a login zsh (your PATH), started in the
 * Claude's folder. `steps` is [{id, label, command, step?, of?}]; two or more
 * run in order in the same shell and stop at the first failure (the rest are
 * skipped). Non-interactive while they run, so `#` comment lines work, and
 * Ctrl-C stops a step but not the script.
 * The steps run under `script`, which keeps a real terminal (colours, prompts)
 * and records everything. When they end, the record goes through `note.pipe`
 * (config `run_log_pipe`, a command that takes the log's name and prints the
 * path it filed it at), or into ~/.config/herdr-kit/runlogs/ when that is empty
 * or prints nothing, and the terminal closes.
 * Each step with an id writes ~/.config/herdr-kit/runstate/<claude>-<id>.json
 * (running, then done with its exit code, or skipped) for the rail. With
 * `note` ({claude, pipe}) it tells that Claude, via `hc send`, how it ended and
 * where the log is.
 */
export function runArgv(steps, cwd, note = null) {
  const list = Array.isArray(steps) ? steps : [{ label: "", command: String(steps) }];
  const many = list.length > 1;
  const claude = note?.claude ?? null;
  // The inner script: the steps themselves, run under `script`.
  const I = [];
  if (claude) {
    I.push(`__kit_claude=${shellQuote(claude)}`);
    I.push(`__kit_dir="$HOME/.config/herdr-kit/runstate"`);
    I.push(`mkdir -p "$__kit_dir" 2>/dev/null`);
    // __kit_state <id> <state> [exit]: one small JSON file, swapped in whole.
    I.push(`__kit_state() { local f="$__kit_dir/$__kit_claude-$1.json"; printf '{"state":"%s","exit":%s,"terminal":"%s","at":%s}\\n' "$2" "\${3:-null}" "$__kit_me" "$(date +%s)" > "$f.tmp" 2>/dev/null && mv -f "$f.tmp" "$f" 2>/dev/null; return 0; }`);
  } else {
    I.push(`__kit_state() { return 0; }`);
  }
  I.push(`__kit_failed=`);
  I.push(`__kit_rc=0`);
  I.push(`__kit_sum=`);
  list.forEach((s, i) => {
    const id = shellQuote(s.id ?? "");
    const tag = many ? `${s.step ?? i + 1}/${s.of ?? list.length} "${oneLine(s.label)}"` : `"${oneLine(s.label)}"`;
    const sep = i ? "; " : "";
    I.push(`if [ -z "$__kit_failed" ]; then`);
    if (s.id) I.push(`__kit_state ${id} running`);
    if (many) I.push(`printf '\\033[90m── step %s ──\\033[0m\\n' ${shellQuote(tag)}`);
    I.push("trap : INT");
    I.push(String(s.command));
    I.push("__kit_rc=$?");
    I.push("trap - INT");
    if (s.id) I.push(`__kit_state ${id} done "$__kit_rc"`);
    I.push(many ? `__kit_sum="$__kit_sum"${shellQuote(`${sep}${tag} exit `)}"$__kit_rc"` : `__kit_sum=${shellQuote(`${tag} exited `)}"$__kit_rc"`);
    I.push(`[ "$__kit_rc" -ne 0 ] && __kit_failed=1`);
    I.push("else");
    if (s.id) I.push(`__kit_state ${id} skipped`);
    I.push(`__kit_sum="$__kit_sum"${shellQuote(`${sep}${tag} skipped`)}`);
    I.push("fi");
  });
  // Hand the result back to the outer shell.
  I.push(`typeset -p __kit_failed __kit_rc __kit_sum > "$__kit_res" 2>/dev/null`);

  const L = [];
  L.push(`export __kit_me=\${HC_TERMINAL_ID:-unknown}`);
  if (cwd) L.push(`cd -- ${shellQuote(cwd)} 2>/dev/null`);
  L.push(`__kit_tmp=$(mktemp -d "\${TMPDIR:-/tmp}/kit-run.XXXXXX")`);
  L.push(`export __kit_res="$__kit_tmp/res"`);
  L.push(`__kit_failed=1 __kit_rc=1 __kit_sum=${shellQuote(`"${oneLine(list[0]?.label)}" didn't finish`)}`);
  L.push(`script -q "$__kit_tmp/raw" zsh -c ${shellQuote(I.join("\n"))}`);
  L.push(`[ -r "$__kit_res" ] && source "$__kit_res"`);
  // Only opens something (a file, a page, a PR in the browser) and it worked:
  // nothing to keep, and don't wake the Claude for it.
  if (list.every((s) => isQuietCommand(s.command))) L.push(`[ -z "$__kit_failed" ] && { rm -rf "$__kit_tmp"; exit 0; }`);
  // Keep the output: through the configured pipe, else in herdr-kit's own folder.
  const slug = shellQuote(runSlug(many ? `${oneLine(list[0].label)} all` : list[0]?.label));
  L.push(`__kit_log=`);
  L.push(`if [ -s "$__kit_tmp/raw" ]; then`);
  const pipe = typeof note?.pipe === "string" ? note.pipe.trim() : "";
  if (pipe) L.push(`__kit_log=$(${pipe} ${slug} < "$__kit_tmp/raw" 2>/dev/null)`);
  L.push(`if [ -z "$__kit_log" ]; then __kit_log="$HOME/.config/herdr-kit/runlogs/$(date +%Y-%m-%d-%H%M%S)-"${slug}.log; mkdir -p "\${__kit_log:h}" && mv -f "$__kit_tmp/raw" "$__kit_log" || __kit_log=; fi`);
  L.push(`fi`);
  L.push(`rm -rf "$__kit_tmp"`);
  if (claude) {
    // Add the log's path to each step's runstate file, so its row can open it.
    const ids = list.filter((s) => s.id).map((s) => shellQuote(s.id));
    if (ids.length) {
      L.push(`if [ -n "$__kit_log" ]; then`);
      L.push(`__kit_esc=\${__kit_log//\\\\/\\\\\\\\}; __kit_esc=\${__kit_esc//\\"/\\\\\\"}`);
      L.push(`for __kit_id in ${ids.join(" ")}; do`);
      L.push(`__kit_f="$HOME/.config/herdr-kit/runstate/"${shellQuote(claude)}"-$__kit_id.json"`);
      L.push(`[ -r "$__kit_f" ] || continue`);
      L.push(`__kit_c=$(<"$__kit_f")`);
      L.push(`printf '%s,"log":"%s"}\\n' "\${__kit_c%\\}*}" "$__kit_esc" > "$__kit_f.tmp" 2>/dev/null && mv -f "$__kit_f.tmp" "$__kit_f" 2>/dev/null`);
      L.push(`done`);
      L.push(`fi`);
    }
    const head = many ? `${RUN_NOTE} all finished: ` : `${RUN_NOTE} finished: `;
    L.push(`if [ -n "$__kit_log" ]; then __kit_where="Output: $__kit_log"; else __kit_where="No output."; fi`);
    L.push(`command -v hc >/dev/null 2>&1 && hc send ${shellQuote(claude)} ${shellQuote(head)}"$__kit_sum. $__kit_where" >/dev/null 2>&1`);
  }
  L.push("exit 0");
  return ["zsh", "-lc", L.join("\n")];
}

/**
 * In the grid: asks herdr-signals for the focus view, then to focus `address`
 * and split `argv` under it. afterView goes first, so it is there when the
 * viewWant is handled. Returns true.
 */
function viewThen(address, argv, h) {
  h.setShared("kit.afterView", { view: "focus", address, argv });
  h.setShared("kit.viewWant", "focus");
  return true;
}

/**
 * Runs Run cards for the Claude at `address` in a new terminal split under its
 * pane: one card, or a numbered sequence in order. The grid shows terminals,
 * not panes, so it asks herdr-signals for the focus view first. `h` is {panes, shared, setShared, run}
 * from "herdr". Returns false when the Claude's pane is gone.
 */
export function runCard(address, steps, h) {
  const p = h.panes().find((x) => x.terminal === address);
  if (!p) return false;
  const argv = runArgv(steps, p.cwd, { claude: address, pipe: h.shared("kit.runLogPipe") });
  if (h.shared("kit.view") === "grid") return viewThen(address, argv, h);
  h.run("agent.focus", { terminal: address });
  h.run("pane.split", { direction: "down", pane: p.pane, argv });
  return true;
}

/**
 * Opens a finished run's log (its `state.log`) in `less -R`, in a split under
 * the Claude's pane: the log keeps the run's colours. Like runCard, it goes to
 * the focus view first. Returns false when there's no log or no pane.
 */
export function openRunLog(address, log, h) {
  if (!log) return false;
  const p = h.panes().find((x) => x.terminal === address);
  if (!p) return false;
  const argv = ["less", "-R", log];
  if (h.shared("kit.view") === "grid") return viewThen(address, argv, h);
  h.run("agent.focus", { terminal: address });
  h.run("pane.split", { direction: "down", pane: p.pane, argv });
  return true;
}

/** A running step's clock since `since` (ms): "0:42", "12:05", "1:02:05". */
export function elapsed(since, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "running 0:42" while a step runs (its state's `since`), "running…" without a start time. */
export function runningText(state, now = Date.now()) {
  return state?.since ? `running ${elapsed(state.since, now)}` : "running…";
}

/**
 * How a Run card's last run went, for its row: {text, tone} or null.
 * tone: "run" (going), "ok", "bad", "dim" (skipped).
 */
export function runStatus(state, now = Date.now()) {
  if (!state) return null;
  if (state.state === "running") return { text: runningText(state, now), tone: "run" };
  if (state.state === "skipped") return { text: "– skipped", tone: "dim" };
  if (state.exit === 0) return { text: "✓ exit 0", tone: "ok" };
  if (state.exit === 130) return { text: "✗ stopped", tone: "bad" };
  return { text: `✗ exit ${state.exit}`, tone: "bad" };
}

/** True when every card's last run finished with exit 0. */
export function ranClean(cards) {
  const list = cards ?? [];
  return list.length > 0 && list.every((r) => r.state?.state === "done" && r.state.exit === 0);
}

/** How long ▶ Again on a card that already ran clean waits for "▶ Run again". */
export const AGAIN_ARMED_FOR = 6000;
/**
 * After a ▶ starts a run, how long that button ignores more presses: the row
 * keeps it until herdr-signals polls the run's "running" state (2 s).
 */
export const RUN_SETTLE_FOR = 2500;

/**
 * Guards one view's ▶ buttons. On 2026-11-09 a merge card that had already
 * worked ran three more times: each run was a real trackpad click that landed
 * on its ▶ Again, which looks and sits just where ▶ Run did. So a press on a
 * card that ran clean only arms it. The run waits for "▶ Run again", drawn on
 * its own line away from the button, while the button turns into Cancel: a
 * second click on the same spot cancels. A card that just started ignores
 * presses until its "running" state shows (a double click).
 * Keys are view-local ids; `now` is epoch ms.
 */
export class RunGate {
  constructor() { this.armedKey = null; this.armedAt = 0; this.started = {}; }

  /** A press on `key`'s ▶: "run" (start it now), "armed" or "busy". */
  press(key, clean, now) {
    if (now - (this.started[key] ?? -Infinity) < RUN_SETTLE_FOR) return "busy";
    if (clean) {
      this.armedKey = key;
      this.armedAt = now;
      return "armed";
    }
    this.cancel(key);
    this.started[key] = now;
    return "run";
  }

  /** Whether `key` waits for its "▶ Run again" at `now`. */
  armed(key, now) {
    return this.armedKey === key && now - this.armedAt < AGAIN_ARMED_FOR;
  }

  /** "▶ Run again": "run" while `key` is still armed, else "expired". */
  confirm(key, now) {
    const ok = this.armed(key, now);
    this.cancel(key);
    if (!ok) return "expired";
    this.started[key] = now;
    return "run";
  }

  cancel(key) {
    if (this.armedKey === key) this.armedKey = null;
  }
}

/**
 * While `going` (a run is going), redraws `owner`'s view in a second, so the
 * running clock ticks; the views' own clock is only every 30 s. One tick is
 * pending at a time, and it stops once nothing runs.
 */
export function runTick(owner, going, cx) {
  if (!going || owner.runTicking) return;
  owner.runTicking = true;
  cx.timer.after(1000, (acx) => { owner.runTicking = false; acx.notify(); });
}

/**
 * A ▶ press through `gate`: runs `start()` or arms the card, and redraws
 * (again when an arm runs out). Returns what the gate said.
 */
export function pressRun(gate, key, clean, start, cx, now = Date.now()) {
  const r = gate.press(key, clean, now);
  if (r === "run") start();
  if (r === "armed") cx.timer.after(AGAIN_ARMED_FOR, (acx) => acx.notify());
  cx.notify();
  return r;
}

/** "▶ Run again" through `gate`: runs `start()` only while `key` is armed. */
export function confirmRun(gate, key, start, cx, now = Date.now()) {
  const r = gate.confirm(key, now);
  if (r === "run") start();
  cx.notify();
  return r;
}

/** The first card whose last run didn't finish with exit 0 (or never ran), or null. */
export function firstOpenRun(runs) {
  return (runs ?? []).find((r) => !(r.state?.state === "done" && r.state.exit === 0)) ?? null;
}

/**
 * The cards in order, numbered sequences gathered: [{seq: [cards]} | {card}].
 * A sequence is cards with step 1..N of the same N, next to each other; a
 * broken one falls back to single cards.
 */
export function groupRuns(runs) {
  const out = [];
  const list = runs ?? [];
  for (let i = 0; i < list.length; ) {
    const r = list[i];
    if (r.step === 1 && r.of >= 2) {
      const seq = list.slice(i, i + r.of);
      if (seq.length === r.of && seq.every((x, k) => x.step === k + 1 && x.of === r.of)) {
        out.push({ seq });
        i += r.of;
        continue;
      }
    }
    out.push({ card: r });
    i++;
  }
  return out;
}

const COPIED_FOR = 1500;

/** Copies `text`, and marks `key` as copied on `view` for 1.5 s. */
export function copyCommand(view, key, text, cx) {
  cx.write_to_clipboard(text);
  view.copied = key;
  cx.notify();
  cx.timer.after(COPIED_FOR, (acx) => {
    if (view.copied === key) view.copied = null;
    acx.notify();
  });
}

/** A small text button that doesn't pass its click to the card under it. */
export function pill(t, id, label, action, color) {
  return div().id(id).flex_none().px(6).py(1).rounded(4).border(1).border_color(t.border)
    .text_size(11).font_medium().text_color(color ?? t.foreground)
    .hover((s) => s.bg(t.hover))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((e, cx) => { cx.stop_propagation(); action(e, cx); })
    .child(label);
}

/** The last reply's rows as plain text, one line per row (bullets kept). */
export function replyText(lines) {
  return lines.join("\n");
}

/**
 * The "✓ LAST REPLY" peek: a heading with a Copy pill, then one row per
 * paragraph or list item. `copied` is the view's flash key; the pill reads
 * "✓ Copied" while it equals `said-<address>`. Null when there are no rows.
 */
export function replyBlock(t, address, lines, copied, onCopy) {
  if (!lines.length) return null;
  const key = `said-${address}`;
  const row = (l, i) => {
    const bullet = l.startsWith("• ");
    return h_flex().id(`said-${address}-${i}`).gap(6).items_start().w_full()
      .when(bullet, (el) => el.child(div().flex_none().w(8).text_size(12).text_color(BLUE).child("•")))
      .child(div().flex_1().min_w(0).text_size(12).text_color(t.foreground).child(bullet ? l.slice(2) : l));
  };
  return v_flex().mt(8).gap(4)
    .child(h_flex().gap(6).items_center()
      .child(div().flex_1().text_size(11).font_semibold().text_color(BLUE).child("✓ LAST REPLY"))
      .child(pill(t, `said-cp-${address}`, copied === key ? "✓ Copied" : "Copy", (_e, cx) => onCopy(key, replyText(lines), cx))))
    .children(lines.map(row));
}

/**
 * The key a dismissed Run card is remembered by (kit.runsDismissed): the
 * Claude and the card's id. Printable only: Herdr's shared store cut keys at a
 * NUL, so every card of a Claude once collapsed to one key (2026-11-07).
 */
export function runKey(address, r) {
  if (r.id) return `${address}:${r.id}`;
  let h = 0x811c9dc5;
  for (const ch of `${r.label}|${r.command}`) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return `${address}:~${h.toString(36)}`;
}

/** The Claude's Run cards minus the ones dismissed. */
export function visibleRuns(a, dismissed) {
  const d = dismissed ?? {};
  return (a?.runs ?? []).filter((r) => !d[runKey(a.address, r)]);
}

/**
 * The next kit.runsDismissed after dismissing `r` of `address`. Keeps only
 * keys still on some Claude, so it can't grow (it is persisted).
 */
export function dismissRun(dismissed, agents, address, r) {
  const live = new Set();
  for (const a of agents ?? []) for (const x of a.runs ?? []) live.add(runKey(a.address, x));
  const next = {};
  for (const k of Object.keys(dismissed ?? {})) if (live.has(k)) next[k] = true;
  next[runKey(address, r)] = true;
  return next;
}
