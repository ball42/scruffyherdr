import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { alertProblems, alertTheme, checkAlert, deriveTones, resolveAlerts } from "../herdr/mods/herdr-signals/alerts.js";
import { DONE, contrast, deltaESim } from "../herdr/mods/herdr-signals/colour.js";
import { SCENES, setActiveScenes } from "../herdr/mods/herdr-signals/scenes.js";

const themeColors = (name) => {
  const f = JSON.parse(readFileSync(new URL(`../herdr/themes/${name}.json`, import.meta.url), "utf8"));
  return { background: f.background, foreground: f.foreground, ...f.colors };
};

test("deriveTones: Mustafar's yellow at night", () => {
  const t = deriveTones("#ffd84d", false, DONE.dark);
  assert.equal(t.orange, "#ffd84d");
  assert.equal(t.blue, "#58a6ff");
  assert.equal(t.ink, "#0d1117");
  assert.ok(contrast(t.ink, t.orange) >= 4.5);
  for (const k of ["count", "badge"]) assert.match(t[k], /^#[0-9a-f]{6}$/);
});

test("deriveTones: light count is darker than the needs-you colour", () => {
  const t = deriveTones("#b35900", true, DONE.light);
  assert.equal(t.blue, "#0969da");
  assert.ok(contrast(t.count, "#ffffff") > contrast(t.orange, "#ffffff"));
});

test("resolveAlerts: no overrides gives the scene defaults", () => {
  const r = resolveAlerts({}, "hoth", SCENES.hoth);
  assert.equal(r.tones.dark.orange, SCENES.hoth.needs.dark);
  assert.equal(r.tones.light.orange, SCENES.hoth.needs.light);
  assert.equal(r.tones.dark.blue, DONE.dark);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(resolveAlerts(undefined, "hoth", SCENES.hoth).tones, r.tones);
});

test("resolveAlerts: one hex sets both modes; {light} changes light only", () => {
  const both = resolveAlerts({ needs: "#123456" }, "hoth", SCENES.hoth).tones;
  assert.equal(both.dark.orange, "#123456");
  assert.equal(both.light.orange, "#123456");
  const lightOnly = resolveAlerts({ needs: { light: "#654321" } }, "hoth", SCENES.hoth).tones;
  assert.equal(lightOnly.light.orange, "#654321");
  assert.equal(lightOnly.dark.orange, SCENES.hoth.needs.dark);
});

test("resolveAlerts: a scene entry beats the global one", () => {
  const cfg = { scenes: { hoth: { needs: "#abcdef" } }, needs: "#123456" };
  assert.equal(resolveAlerts(cfg, "hoth", SCENES.hoth).tones.dark.orange, "#abcdef");
  assert.equal(resolveAlerts(cfg, "endor", SCENES.endor).tones.dark.orange, "#123456");
});

test("resolveAlerts: a done override changes blue in both modes", () => {
  const t = resolveAlerts({ done: "#00aaff" }, "hoth", SCENES.hoth).tones;
  assert.equal(t.dark.blue, "#00aaff");
  assert.equal(t.light.blue, "#00aaff");
});

test("resolveAlerts: a bad value or unknown scene keeps the defaults and names one problem", () => {
  const bad = resolveAlerts({ needs: "orange" }, "hoth", SCENES.hoth);
  assert.equal(bad.tones.dark.orange, SCENES.hoth.needs.dark);
  assert.equal(bad.problems.length, 1);
  assert.match(bad.problems[0], /orange/);
  const typo = resolveAlerts({ scenes: { hot: { needs: "#ffffff" } } }, "hoth", SCENES.hoth);
  assert.equal(typo.tones.dark.orange, SCENES.hoth.needs.dark);
  assert.equal(typo.problems.length, 1);
  assert.match(typo.problems[0], /hot/);
});

test("checkAlert: Mustafar's yellow passes in its night theme", () => {
  const c = checkAlert("#ffd84d", DONE.dark, themeColors("mustafar-night"));
  assert.equal(c.ok, true);
  assert.ok(c.done >= 20 && c.fill >= 3 && c.bar >= 15);
  assert.equal(typeof c.working, "number");
});

test("checkAlert: done-blue as needs-you fails", () => {
  assert.equal(checkAlert("#58a6ff", DONE.dark, themeColors("mustafar-night")).ok, false);
});

test("deriveTones: the count reads on its badge (4.5:1) for every scene, night and day", () => {
  for (const [k, s] of Object.entries(SCENES)) {
    for (const mode of ["dark", "light"]) {
      const t = deriveTones(s.needs[mode], mode === "light", DONE[mode]);
      assert.ok(contrast(t.count, t.badge) >= 4.5, `${k} ${mode}: ${t.count} on ${t.badge} is ${contrast(t.count, t.badge).toFixed(2)}`);
    }
  }
});

test("deriveTones: leaves sun to the scene (it isn't derived)", () => {
  assert.equal("sun" in deriveTones("#ffd84d", false, DONE.dark), false);
});

test("alertTheme: the theme's blocked and done become the resolved colours for its mode", () => {
  const tones = resolveAlerts({ needs: { dark: "#ffd84d", light: "#8a6a00" }, done: "#00aaff" }, "hoth", SCENES.hoth).tones;
  const dark = alertTheme({ background: "#0d1117", blocked: "#ff9e7a", done: "#58a6ff", muted: "#888888" }, tones);
  assert.equal(dark.blocked, "#ffd84d");
  assert.equal(dark.done, "#00aaff");
  assert.equal(dark.muted, "#888888");
  assert.equal(alertTheme({ background: "#ffffff", blocked: "#b4542f" }, tones).blocked, "#8a6a00");
  const t = { background: "#0d1117", blocked: "#ff9e7a" };
  assert.equal(alertTheme(t, null), t);
});

test("alertProblems: names a bad value anywhere in alert_colors, once", () => {
  const one = (cfg, re) => {
    const p = alertProblems(cfg);
    assert.equal(p.length, 1, `${JSON.stringify(cfg)}: ${JSON.stringify(p)}`);
    assert.match(p[0], re);
  };
  one({ scenes: { hoth: { needs: "salmon" } } }, /salmon/);
  one({ needs: { light: "zzz" } }, /zzz/);
  one({ needs: { lihgt: "#ffffff" } }, /lihgt/);
  one({ scenes: { hoth: "#ffffff" } }, /hoth/);
  one({ need: "#ffffff" }, /need/);
  one("#ffd84d", /alert_colors/);
  one({ scenes: { hot: { needs: "#ffffff" } } }, /hot/);
  assert.deepEqual(alertProblems({ needs: "orange" }).length, 1);
  assert.deepEqual(alertProblems(undefined), []);
  assert.deepEqual(alertProblems({}), []);
  assert.deepEqual(alertProblems({ needs: { dark: "#ffd84d", light: "#8a6a00" }, done: "#58a6ff", scenes: { hoth: { needs: "#ffe5de" } } }), []);
});

test("README: the alert_colors row's first example passes in every scene, night and day", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const row = readme.split("\n").find((l) => l.startsWith("| `alert_colors`"));
  const ex = JSON.parse(row.match(/`(\{"needs":.*?\})`/)[1]);
  for (const [k, s] of Object.entries(SCENES)) {
    const { tones } = resolveAlerts(ex, k, s);
    for (const [mode, file] of [["dark", "night"], ["light", "day"]]) {
      assert.ok(checkAlert(tones[mode].orange, tones[mode].blue, themeColors(`${k}-${file}`)).ok, `${k} ${file}`);
    }
  }
});

test("deriveTones: a light badge keeps a tint once the count is darkened", () => {
  const t = deriveTones("#8b8810", true, DONE.light);
  assert.notEqual(t.badge, "#ffffff", "Endor's day badge is tinted");
  assert.ok(contrast(t.count, t.badge) >= 4.5);
});

test("deriveTones: a dark override too dim for its badge gets a lighter count", () => {
  const t = deriveTones("#123456", false, DONE.dark);
  assert.ok(contrast(t.count, t.badge) >= 4.5, `${t.count} on ${t.badge}`);
  assert.equal(t.orange, "#123456", "the fill stays the chosen colour");
});

test("deriveTones: every scene's badge is tinted, night and day", () => {
  for (const [k, s] of Object.entries(SCENES)) {
    for (const mode of ["dark", "light"]) {
      const t = deriveTones(s.needs[mode], mode === "light", DONE[mode]);
      assert.notEqual(t.badge, mode === "light" ? "#ffffff" : "#0d1117", `${k} ${mode}`);
    }
  }
});

test("checkAlert: the bar is judged against the done override", () => {
  // An accent near the done override clashes, so the bar falls to the foreground.
  const colors = { background: "#0d1117", foreground: "#e6edf3", accent: "#3fb950" };
  const withDone = checkAlert("#ffd84d", "#3fb950", colors);
  assert.equal(withDone.bar, deltaESim("#ffd84d", "#e6edf3"));
});

test("alertTheme: tones resolved for another scene leave the theme as it is", () => {
  const t = { background: "#0d1117", blocked: "#ff9e7a", done: "#58a6ff" };
  const tones = { scene: "endor", dark: { orange: "#ffd84d", blue: "#58a6ff" } };
  assert.equal(alertTheme(t, tones, "hoth"), t);
  assert.equal(alertTheme(t, tones, "endor").blocked, "#ffd84d");
});

// Config is shared by every kit layout: a scene key of core's, the shown layout's set or another kit layout's is fine on either.
test("alert_colors.scenes accepts core keys on an extra set and extra keys on core; only a key in neither is named", () => {
  const extra = { "fixture-scene": { ...SCENES.hoth, label: "Fixture" } };
  const cfg = { scenes: { naboo: { needs: "#ffd84d" }, "fixture-scene": { needs: "#ffd84d" }, nowhere: { needs: "#ffd84d" } } };
  const named = (ps) => ps.filter((p) => p.startsWith("alert_colors scenes: no scene"));
  const nowhere = ['alert_colors scenes: no scene named "nowhere"'];
  try {
    // On the extra set: core's naboo is fine.
    setActiveScenes(extra);
    assert.deepEqual(named(alertProblems(cfg)), nowhere);
    assert.deepEqual(named(resolveAlerts(cfg, "fixture-scene", extra["fixture-scene"]).problems), nowhere);
    // On core: the other kit layout's key is fine when its keys are passed.
    setActiveScenes(null);
    assert.deepEqual(named(alertProblems(cfg, new Set(["fixture-scene"]))), nowhere);
    assert.deepEqual(named(alertProblems(cfg)), ['alert_colors scenes: no scene named "fixture-scene"', ...nowhere]);
  } finally { setActiveScenes(null); }
});
