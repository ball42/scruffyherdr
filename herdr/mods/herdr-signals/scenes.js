// Scenes: each is a look for the one kit layout (KIT_LAYOUT): a theme pair,
// a night and day picture, the glass tint and the needs-you colour, so one
// pick sets the whole look. Pure.

export const SCENES = {
  tatooine: {
    label: "Tatooine",
    theme: { light: "tatooine-day", dark: "tatooine-night" },
    walls: { dark: "backgrounds/twin-suns.jpg", light: "backgrounds/twin-suns-day.jpg" },
    // The theme pair's backgrounds: the glass tint over the sidebar and bars (glass.js).
    panel: { dark: "#14111f", light: "#fbf5ef" },
    // Needs-you: desert orange (the same tones as kit-rail's look.js), twin suns on the strip.
    needs: { dark: "#ec8e2c", light: "#b35900" },
    asks: "☀☀",
  },
  endor: {
    label: "Endor",
    theme: { light: "endor-day", dark: "endor-night" },
    walls: { dark: "backgrounds/forest-moon.jpg", light: "backgrounds/forest-moon-day.jpg" },
    panel: { dark: "#0c1a18", light: "#f4f8f4" },
    // Firefly gold, still warm against the blue "done"; a fir with fireflies on the strip.
    needs: { dark: "#f2c14e", light: "#8a6400" },
    asks: "fireflies",
  },
  hoth: {
    label: "Hoth",
    theme: { light: "hoth-day", dark: "hoth-night" },
    walls: { dark: "backgrounds/hoth.jpg", light: "backgrounds/hoth-day.jpg" },
    panel: { dark: "#0f1726", light: "#f6f9fc" },
    // Signal coral, warm against the blue "done" on a cold blue scene; a snowflake on the strip.
    needs: { dark: "#ff9e7a", light: "#b4542f" },
    asks: "❄",
  },
  dagobah: {
    label: "Dagobah",
    theme: { light: "dagobah-day", dark: "dagobah-night" },
    walls: { dark: "backgrounds/dagobah.jpg", light: "backgrounds/dagobah-day.jpg" },
    panel: { dark: "#0d1512", light: "#f3f4ec" },
    // Swamp-lantern amber, warm against the blue "done"; ripples on the strip.
    needs: { dark: "#f0b45a", light: "#9a5a00" },
    asks: "≈",
  },
  coruscant: {
    label: "Coruscant",
    theme: { light: "coruscant-day", dark: "coruscant-night" },
    walls: { dark: "backgrounds/coruscant.jpg", light: "backgrounds/coruscant-day.jpg" },
    panel: { dark: "#120f22", light: "#f8f6fb" },
    // Sodium-lamp amber, warm against the blue "done"; a lit window grid on the strip.
    needs: { dark: "#ffb347", light: "#a85a00" },
    asks: "▥",
  },
  bespin: {
    label: "Bespin",
    theme: { light: "bespin-day", dark: "bespin-night" },
    walls: { dark: "backgrounds/bespin.jpg", light: "backgrounds/bespin-day.jpg" },
    panel: { dark: "#161226", light: "#fbf6f6" },
    // Landing-light gold, warm against the blue "done"; a cloud on the strip.
    needs: { dark: "#ffcf5c", light: "#946200" },
    asks: "☁",
  },
  naboo: {
    label: "Naboo",
    theme: { light: "naboo-day", dark: "naboo-night" },
    walls: { dark: "backgrounds/naboo.jpg", light: "backgrounds/naboo-day.jpg" },
    panel: { dark: "#0e1628", light: "#f5f8f4" },
    // Palace bronze, warm against the blue "done"; a palace roof on the strip.
    needs: { dark: "#ffab66", light: "#a3520c" },
    asks: "⌂",
  },
  scarif: {
    label: "Scarif",
    theme: { light: "scarif-day", dark: "scarif-night" },
    walls: { dark: "backgrounds/scarif.jpg", light: "backgrounds/scarif-day.jpg" },
    panel: { dark: "#0a1626", light: "#f3f9f8" },
    // Beacon orange, warm against the blue "done"; the shield gate's arc on the strip.
    needs: { dark: "#ff9a3c", light: "#a14a00" },
    asks: "⌒",
  },
  kamino: {
    label: "Kamino",
    theme: { light: "kamino-day", dark: "kamino-night" },
    walls: { dark: "backgrounds/kamino.jpg", light: "backgrounds/kamino-day.jpg" },
    panel: { dark: "#0b141c", light: "#f2f5f7" },
    // Storm amber, warm against the blue "done"; an umbrella for the rain on the strip.
    needs: { dark: "#ffb84a", light: "#9a5800" },
    asks: "☂",
  },
  "small-moon": {
    label: "Small Moon",
    theme: { light: "small-moon-day", dark: "small-moon-night" },
    walls: { dark: "backgrounds/small-moon.jpg", light: "backgrounds/small-moon-day.jpg" },
    panel: { dark: "#0a0c14", light: "#f4f5f7" },
    // Reactor orange (a green beam would sit against the blue "done" as red
    // against green does), and the station with its light on the strip.
    needs: { dark: "#ff8a3d", light: "#a24800" },
    asks: "◉",
  },
};
export const DEFAULT_SCENE = "tatooine";

/** The one kit layout; the scene and the view live inside it. */
export const KIT_LAYOUT = "scruffy";

/**
 * The one layout's old name. install.sh moves a window on it to KIT_LAYOUT,
 * reading the scene and view from its tree, and make-layout.js takes its
 * file (and .state) as the existing kit file until KIT_LAYOUT's exists.
 */
export const OLD_KIT_LAYOUT = "scruffyherdr";

/** Every kit layout name (install.sh's KIT_LAYOUTS): just the one. */
export function kitLayouts() {
  return [KIT_LAYOUT];
}

/**
 * The layouts install generated before the one layout: each scene's focus
 * and grid pair, then the pre-scene "kit" and "kit-grid", and the one
 * layout's old name (OLD_KIT_LAYOUT). install.sh removes their files and
 * moves a window on one to KIT_LAYOUT.
 */
export const LEGACY_LAYOUTS = [...Object.keys(SCENES).flatMap((s) => [s, `${s}-grid`]), "kit", "kit-grid", OLD_KIT_LAYOUT];

const known = (k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(SCENES, k);

/** { scene, view } an old scene layout name showed ("endor-grid" gives endor in grid), or null for any other name. */
export function legacyView(name) {
  if (typeof name !== "string") return null;
  const grid = name.endsWith("-grid");
  const scene = grid ? name.slice(0, -5) : name;
  return known(scene) ? { scene, view: grid ? "grid" : "focus" } : null;
}

/** The scene for a scene key; the default scene for anything else. */
export const sceneFor = (scene) => SCENES[known(scene) ? scene : DEFAULT_SCENE];

/** The scene a theme name belongs to ("endor-night" gives "endor"), or null. */
export function sceneOfTheme(name) {
  if (typeof name !== "string") return null;
  return Object.keys(SCENES).find((k) => SCENES[k].theme.light === name || SCENES[k].theme.dark === name) ?? null;
}

/**
 * The scene a layout tree is dressed as: the one whose theme pair equals the
 * root `theme`; else the scene of the light half, then of the dark half; else
 * the default scene.
 */
export function sceneOfTree(tree) {
  const t = tree?.theme;
  const light = t?.light;
  const dark = t?.dark;
  const exact = Object.keys(SCENES).find((k) => SCENES[k].theme.light === light && SCENES[k].theme.dark === dark);
  return exact ?? sceneOfTheme(light) ?? sceneOfTheme(dark) ?? DEFAULT_SCENE;
}

/**
 * The ids of the grid's nodes. Herdr's layout() folds a one-child column into
 * its child (the child's id survives), so a small grid reads back without
 * `kit-grid`: a row, a lone tile or the placeholder sits where main was.
 */
export const GRID_NODE = /^(kit-grid$|grid-row-\d+$|grid-cards$|grid-chips$|tile-)/;

/** Whether a layout tree is the grid view: it has a grid node, folded or not. */
export function isGridTree(tree) {
  if (!tree || typeof tree !== "object") return false;
  if (typeof tree.id === "string" && GRID_NODE.test(tree.id)) return true;
  return Array.isArray(tree.children) && tree.children.some(isGridTree);
}

/** What a scene publishes for the picker: its thumbnails sit next to its pictures, under backgrounds/thumbs/. */
export function sceneList(scenes = SCENES) {
  const thumb = (wall) => wall.replace(/^backgrounds\//, "backgrounds/thumbs/");
  return Object.entries(scenes).map(([key, s]) => ({
    key, label: s.label, thumbs: { dark: thumb(s.walls.dark), light: thumb(s.walls.light) }, needs: s.needs, asks: s.asks, glyph: s.asks === "fireflies" ? "✦" : s.asks,
  }));
}
