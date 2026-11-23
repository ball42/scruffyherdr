// The Dock badge (config dock_badge): how many Claudes are blocked, on the
// app's icon. main.js calls setBadge only when this step says so. Pure.

/** The badge text: the blocked count as a string while `on` and any are blocked, else null (cleared). */
export function dockBadge(on, blocked) {
  return on === true && Number.isInteger(blocked) && blocked > 0 ? String(blocked) : null;
}

/**
 * One poll's badge step. `last` is the text last set (undefined before the
 * first call, so a starting mod clears or sets it once). `call` is true only
 * when the text changes; a key turned off clears it once and then stays quiet.
 * @returns {{text: string|null, call: boolean}}
 */
export function badgeStep(last, on, blocked) {
  const text = dockBadge(on, blocked);
  return { text, call: text !== last };
}
