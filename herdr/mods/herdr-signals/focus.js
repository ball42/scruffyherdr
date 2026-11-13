// Focus mode: while the user is heads-down, finished Claudes stop alerting and
// blocked ones alert as always. Pure: main.js owns the toggle, the toast and
// the strip line.
//
// `kit.focus` is `{since: epochMs}` while on, null (or absent) when off. It is
// a shared key, so it persists across a Herdr reload like `kit.snooze`.
// A done Claude is "held" while focus is on: buildModel marks its row
// snoozed (so the rail dims it and every alert path skips it) with
// `snooze_focus: true`, and summary() counts it as `held` instead of `done`.

export const FOCUS_MAX_MINUTES = 120;
export const DIGEST_MS = 60_000;
const MAX_NAMES = 6;

/** Whether a `kit.focus` value is an active focus stretch. */
export const focusOn = (f) => f !== null && typeof f === "object" && typeof f.since === "number";

/** The next `kit.focus` after a toggle at `now`. */
export const focusToggle = (f, now) => (focusOn(f) ? null : { since: now });

/** Whether this status is held back by focus mode. Only done is: blocked always alerts. */
export const focusHolds = (f, status) => focusOn(f) && status === "done";

/** The auto-off limit in ms from the `focus_max_minutes` config value (default when unusable). */
export function focusLimitMs(minutes) {
  const m = typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0 ? minutes : FOCUS_MAX_MINUTES;
  return m * 60_000;
}

/** Whether focus has run past its limit and should turn itself off. */
export const focusExpired = (f, now, minutes) => focusOn(f) && now - f.since >= focusLimitMs(minutes);

/** "23m", "1h 5m": a duration in whole minutes (at least 1m). */
export function span(ms) {
  const m = Math.max(1, Math.floor(ms / 60_000));
  if (m < 60) return `${m}m`;
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
}

/** The strip button's text: "◎ focus" off, "◎ focusing 23m" on (no time in the first minute). */
export function focusLabel(f, now) {
  if (!focusOn(f)) return "◎ focus";
  return now - f.since < 60_000 ? "◎ focusing" : `◎ focusing ${span(now - f.since)}`;
}

/** The muted strip count for held done Claudes: "◎ 3 done". */
export const heldLabel = (n) => `◎ ${n} done`;

/**
 * What finished while focus was on and is still done: model rows whose done
 * stretch began at or after `f.since`. Null when there are none.
 * @returns {{minutes: string, count: number, names: string[], text: string, first: string} | null}
 */
export function focusDigest(f, rows, now) {
  if (!focusOn(f)) return null;
  const hit = (rows ?? []).filter((a) => a.status === "done" && typeof a.attention?.since === "number" && a.attention.since >= f.since)
    .sort((x, y) => x.attention.since - y.attention.since);
  if (!hit.length) return null;
  const names = hit.map((a) => a.name ?? a.address);
  const shown = names.slice(0, MAX_NAMES).join(", ");
  const more = names.length > MAX_NAMES ? `, +${names.length - MAX_NAMES} more` : "";
  const minutes = span(now - f.since);
  return {
    minutes,
    count: hit.length,
    names,
    text: `While you focused (${minutes}): ${hit.length} finished: ${shown}${more}`,
    first: hit[0].address,
  };
}
