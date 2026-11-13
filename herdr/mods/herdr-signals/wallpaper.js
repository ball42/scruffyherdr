// Light mode gets its own wallpaper. A layout holds one picture; dress.js sets
// the scene's night or day one. Pure.

import { DEFAULT_SCENE, SCENES, sceneFor } from "./scenes.js";

export const DARK_WALL = SCENES[DEFAULT_SCENE].walls.dark;
export const LIGHT_WALL = SCENES[DEFAULT_SCENE].walls.light;

const BUILT_IN = new Set(Object.values(SCENES).flatMap((s) => [s.walls.dark, s.walls.light]));

/**
 * The picture for this appearance in `scene` (a scene key) from config `look`,
 * or null when the wallpaper is off. A bundled picture follows the layout's
 * scene; a custom one serves every scene, both appearances until a light one is set.
 */
export function wallFor(look = {}, light = false, scene = null) {
  const dark = "wallpaper" in look ? look.wallpaper : DARK_WALL;
  if (!dark) return null;
  if (light && look.wallpaper_light) return look.wallpaper_light;
  if (BUILT_IN.has(dark)) {
    const walls = sceneFor(scene).walls;
    return light ? walls.light : walls.dark;
  }
  return dark;
}
