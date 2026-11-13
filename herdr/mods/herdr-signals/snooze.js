// Snooze: which Claudes are muted, and when they wake.
//
// `kit.snooze` maps a terminal address to either an epoch-ms time (a timed
// snooze: 15 m, 1 h) or `{done: snoozedAtMs}` (till done). A till-done snooze
// wakes when the Claude next finishes, or asks something new, after it was
// snoozed; what it was already showing stays muted. It also ends after
// TILL_DONE_CAP_MS so a forgotten Claude doesn't stay muted for good.

export const TILL_DONE_CAP_MS = 8 * 60 * 60 * 1000;

const tillDone = (e) => e !== null && typeof e === "object" && typeof e.done === "number";

/** Whether a `kit.snooze` entry still mutes at `now` (ignores attention). */
export function snoozeActive(entry, now) {
  if (typeof entry === "number") return entry > now;
  if (tillDone(entry)) return now < entry.done + TILL_DONE_CAP_MS;
  return false;
}

/**
 * Drop entries that have ended. `attention` is attentionStep's state
 * ({[address]: {kind, since}}): a till-done entry ends once its Claude's
 * done or blocked stretch began at or after the snooze.
 * @returns {{snooze: object, changed: boolean}}
 */
export function pruneSnooze(snooze, attention, now) {
  const next = {};
  let changed = false;
  for (const [addr, entry] of Object.entries(snooze ?? {})) {
    const att = attention?.[addr];
    const woke = tillDone(entry) && (att?.kind === "done" || att?.kind === "blocked") && typeof att.since === "number" && att.since >= entry.done;
    if (snoozeActive(entry, now) && !woke) next[addr] = entry;
    else changed = true;
  }
  return { snooze: next, changed };
}

/** The snooze fields a model row carries. */
export function snoozeInfo(entry, now) {
  const on = snoozeActive(entry, now);
  return {
    snoozed: on,
    snooze_until: on && typeof entry === "number" ? entry : null,
    snooze_till_done: on && tillDone(entry),
  };
}
