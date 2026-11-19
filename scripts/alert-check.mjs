// install.sh --check: one warn line per config alert_colors override that fails
// the deuteranopia checks (alerts.js checkAlert) in its scene's night or day theme.
// Usage: node scripts/alert-check.mjs <config.json>. Prints nothing when there is
// no override or the config can't be read; always exits 0 (warnings aren't drift).
import { readFileSync } from "node:fs";
import { checkAlert, resolveAlerts } from "../herdr/mods/herdr-signals/alerts.js";
import { DONE } from "../herdr/mods/herdr-signals/colour.js";
import { SCENES } from "../herdr/mods/herdr-signals/scenes.js";

const read = (path) => {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
};

const cfg = read(process.argv[2])?.alert_colors;
if (cfg && typeof cfg === "object" && Object.keys(cfg).length > 0) {
  for (const [key, scene] of Object.entries(SCENES)) {
    const { tones } = resolveAlerts(cfg, key, scene);
    for (const [mode, file] of [["dark", "night"], ["light", "day"]]) {
      const needs = tones[mode].orange;
      const done = tones[mode].blue;
      if (needs === scene.needs[mode].toLowerCase() && done === DONE[mode]) continue; // no override here
      const theme = read(new URL(`../herdr/themes/${key}-${file}.json`, import.meta.url));
      if (!theme) continue;
      const c = checkAlert(needs, done, { background: theme.background, foreground: theme.foreground, ...theme.colors });
      const at = `alert_colors: ${key} ${file} needs-you ${needs}`;
      if (c.done < 20) console.log(`${at} is within ${c.done.toFixed(0)} of done-blue ${done} with deuteranopia (20 wanted)`);
      if (c.fill < 3) console.log(`${at} has ${c.fill.toFixed(1)}:1 contrast on the background (3 wanted)`);
      if (c.bar < 15) console.log(`${at} is within ${c.bar.toFixed(0)} of the active-card bar with deuteranopia (15 wanted)`);
    }
  }
}
