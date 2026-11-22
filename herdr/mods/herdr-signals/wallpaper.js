// Light mode gets its own wallpaper. A layout holds one picture; dress.js sets
// the scene's night or day one. Pure.

import { DEFAULT_SCENE, SCENES, activeScenes, sceneFor } from "./scenes.js";

export const DARK_WALL = SCENES[DEFAULT_SCENE].walls.dark;
export const LIGHT_WALL = SCENES[DEFAULT_SCENE].walls.light;

const builtIn = () => new Set(Object.values(activeScenes()).flatMap((s) => [s.walls.dark, s.walls.light]));

/**
 * The picture for this appearance in `scene` (a scene key) from config `look`,
 * or null when the wallpaper is off. A bundled picture follows the layout's
 * scene; a custom one serves every scene, both appearances until a light one is set.
 */
export function wallFor(look = {}, light = false, scene = null) {
  const dark = "wallpaper" in look ? look.wallpaper : DARK_WALL;
  if (!dark) return null;
  if (light && look.wallpaper_light) return look.wallpaper_light;
  if (dark === DARK_WALL || builtIn().has(dark)) {
    const walls = sceneFor(scene).walls;
    return light ? walls.light : walls.dark;
  }
  return dark;
}
