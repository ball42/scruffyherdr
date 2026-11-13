// Claude usage limits for the strip and the Stream Deck: the 5-hour and weekly
// windows, how fast the 5-hour one is burning, and when it will run out.
// Pure: no herdr globals, no I/O. main.js reads ~/.cache/herdr-chat/claude-limits.json,
// which Claude Code's status line writes on every assistant turn.

export const WARN_5H = 80; // % used: the 5-hour figure turns "needs you" orange
export const WARN_WEEK = 90; // % used, for the week
export const STALE_MS = 10 * 60_000; // a reading older than this is dimmed
export const PACE_MIN_MS = 30 * 60_000; // history needed before projecting
const MAX_POINTS = 360; // one a minute (PACE_STEP_MS) covers the whole 5h window
const PACE_STEP_MS = 60_000;

const WINDOWS = { five: 300, week: 10080 };

/**
 * The file's text as `{five, week, at}` (`at` in seconds; a window is
 * `{used, resets}` or null). Null for missing or malformed text: no meter.
 */
export function parseLimits(text) {
  let v;
  try { v = JSON.parse(text); } catch { return null; }
  if (!v || typeof v !== "object" || !Array.isArray(v.limits)) return null;
  if (!Number.isFinite(v.at)) return null;
  const pick = (minutes) => {
    const e = v.limits.find((l) => l && l.minutes === minutes);
    if (!e || !Number.isFinite(e.used) || !Number.isFinite(e.resets)) return null;
    return { used: Math.min(100, Math.max(0, e.used)), resets: e.resets };
  };
  const out = { five: pick(WINDOWS.five), week: pick(WINDOWS.week), at: v.at };
  return out.five || out.week ? out : null;
}

/** Local wall clock for unix `seconds`: "2:40p", "9a"; with `day`, "Fri 9a". */
export function clockTime(seconds, day = false) {
  const d = new Date(seconds * 1000);
  const h = d.getHours();
  const m = d.getMinutes();
  const t = `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
  return day ? `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${t}` : t;
}

/**
 * Add a 5-hour reading to the history `{resets, points: [{at, used}]}` (`at` in
 * ms). A different `resets` is a new window, so the history starts over; so does
 * no reading. Repeats of the same `at` are ignored.
 */
export function paceAdd(hist, five, atMs) {
  if (!five) return { resets: null, points: [] };
  const same = hist && hist.resets === five.resets;
  const points = same ? hist.points : [];
  // Busy days write a reading every few seconds; one a minute keeps 30+ minutes of history.
  if (points.length && atMs - points[points.length - 1].at < PACE_STEP_MS) return { resets: five.resets, points };
  return { resets: five.resets, points: [...points, { at: atMs, used: five.used }].slice(-MAX_POINTS) };
}

/**
 * When (ms) the 5-hour window hits 100% at the burn rate of the newest reading
 * against the latest one at least 30 minutes older; null when there isn't that
 * much history, the rate is flat or falling, or 100% would land after the reset.
 */
export function projectOut(points, resetsSec) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const last = points[points.length - 1];
  if (last.used >= 100) return null;
  let ref = null;
  for (let i = points.length - 2; i >= 0; i--) {
    if (last.at - points[i].at >= PACE_MIN_MS) { ref = points[i]; break; }
  }
  if (!ref) return null;
  const rate = (last.used - ref.used) / (last.at - ref.at);
  if (!(rate > 0)) return null;
  const out = last.at + (100 - last.used) / rate;
  return out < resetsSec * 1000 ? Math.round(out) : null;
}

/**
 * What the strip and the deck show, or null for no meter. `hist` is paceAdd's
 * history. Each window: `{text, over, used, reset}`; a window past its reset
 * reads "—" until a fresh reading. `out` is "⚠ out ~3:40p" (`outTime` "3:40p"),
 * `stale` a reading over 10 minutes old, `tip` the tooltip.
 */
export function usageView(limits, hist, now) {
  if (!limits || (!limits.five && !limits.week)) return null;
  const atMs = limits.at * 1000;
  const stale = now - atMs > STALE_MS;
  const win = (w, tag, warn, day) => {
    if (!w) return null;
    if (w.resets * 1000 <= now) return { text: `${tag} —`, over: false, used: null, reset: null };
    const over = w.used >= warn;
    const pct = Math.round(w.used);
    return { text: `${over ? "⚠ " : ""}${tag} ${pct}%`, over, used: pct, reset: clockTime(w.resets, day) };
  };
  const five = win(limits.five, "5h", WARN_5H, false);
  const week = win(limits.week, "wk", WARN_WEEK, true);
  let outTime = null;
  if (five && five.used !== null && !stale && hist && hist.resets === limits.five.resets) {
    const ms = projectOut(hist.points, limits.five.resets);
    if (ms !== null && ms > now) outTime = clockTime(ms / 1000);
  }
  const tips = [];
  if (five) tips.push(five.used === null ? "5h window: reset, waiting for a fresh reading" : `5h window: ${five.used}% used, resets ${five.reset}`);
  if (week) tips.push(week.used === null ? "week: reset, waiting for a fresh reading" : `week: ${week.used}% used, resets ${week.reset}`);
  if (outTime) tips.push(`at this pace the 5h window runs out ~${outTime}`);
  if (stale) tips.push(`as of ${clockTime(limits.at)}`);
  return { five, week, out: outTime ? `⚠ out ~${outTime}` : null, outTime, stale, tip: tips.join("\n") };
}
