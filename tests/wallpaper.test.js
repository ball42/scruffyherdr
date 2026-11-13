import { test } from "node:test";
import assert from "node:assert/strict";
import { DARK_WALL, LIGHT_WALL, wallFor } from "../herdr/mods/herdr-signals/wallpaper.js";
import { SCENES } from "../herdr/mods/herdr-signals/scenes.js";

test("wallFor: the default dusk picture gets the day one in light mode", () => {
  assert.equal(wallFor({}, false), DARK_WALL);
  assert.equal(wallFor({}, true), LIGHT_WALL);
  assert.equal(wallFor({ wallpaper: DARK_WALL }, true), LIGHT_WALL);
});

test("wallFor: a custom picture serves both until a light one is set", () => {
  assert.equal(wallFor({ wallpaper: "backgrounds/dunes.jpg" }, true), "backgrounds/dunes.jpg");
  assert.equal(wallFor({ wallpaper: "backgrounds/dunes.jpg", wallpaper_light: "backgrounds/noon.jpg" }, true), "backgrounds/noon.jpg");
  assert.equal(wallFor({ wallpaper: "backgrounds/dunes.jpg", wallpaper_light: "backgrounds/noon.jpg" }, false), "backgrounds/dunes.jpg");
});

test("wallFor: wallpaper off stays off in both modes", () => {
  assert.equal(wallFor({ wallpaper: "" }, false), null);
  assert.equal(wallFor({ wallpaper: "", wallpaper_light: "backgrounds/noon.jpg" }, true), null);
});

const FOREST = SCENES.endor.walls;

test("wallFor: the Endor scene shows the forest moon, night or day", () => {
  assert.equal(wallFor({}, false, "endor"), FOREST.dark);
  assert.equal(wallFor({}, true, "endor"), FOREST.light);
  assert.equal(wallFor({ wallpaper: DARK_WALL }, false, "endor"), FOREST.dark, "the bundled default follows the scene");
  assert.equal(wallFor({ wallpaper: FOREST.dark }, false, "tatooine"), DARK_WALL);
});

test("wallFor: Tatooine and unknown scenes keep twin-suns", () => {
  assert.equal(wallFor({}, true, "tatooine-grid"), LIGHT_WALL);
  assert.equal(wallFor({}, false, "main"), DARK_WALL);
  assert.equal(wallFor({}, false, null), DARK_WALL);
});

test("wallFor: a custom picture beats every scene", () => {
  assert.equal(wallFor({ wallpaper: "backgrounds/dunes.jpg" }, false, "endor"), "backgrounds/dunes.jpg");
  assert.equal(wallFor({ wallpaper_light: "backgrounds/noon.jpg" }, true, "endor"), "backgrounds/noon.jpg");
  assert.equal(wallFor({ wallpaper: "" }, false, "endor"), null);
});
