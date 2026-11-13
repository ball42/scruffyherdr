// Glass: the scene shows through the sidebar, tab bar, status bar and rail.
// The bar and list mods paint the theme's `chrome`, so a scene layout makes it
// clear and tints each area once with the scene's panel colour, at
// `look.glass` strength (the rail a little lighter). A colour with alpha can't
// follow the appearance by itself, so dress.js sets the tint with the
// pictures. Menus, dialogs and cards don't use `chrome` and stay solid. Pure.

import { DEFAULT_SCENE, SCENES } from "./scenes.js";

/** Default tint strength: 0 shows the picture bare, 1 is solid. */
export const GLASS = 0.6;
/** The tinted areas: node ids in every scene layout. */
export const GLASS_AREAS = ["sidebar", "tabs", "status", "rail"];
// The rail sits beside the terminals, so it takes a lighter tint than the bars.
const RAIL_LESS = 0.15;

/** The tint strength from config `look`: `look.glass` (0..1), 0 when false, else the default. */
export function glassStrength(look = {}) {
  const g = look?.glass;
  if (g === false) return 0;
  return typeof g === "number" && g >= 0 && g <= 1 ? g : GLASS;
}

const alpha = (p) => Math.round(Math.max(0, Math.min(1, p)) * 255).toString(16).padStart(2, "0");

/** `#rrggbbaa`: the scene's panel colour for this appearance at this area's strength. */
export function glassTint(scene, light, strength, area) {
  const panel = (SCENES[scene] ?? SCENES[DEFAULT_SCENE]).panel[light ? "light" : "dark"];
  return panel + alpha(area === "rail" ? strength - RAIL_LESS : strength);
}
