// Pins (`kit.pins`, a list of terminal addresses) outlive their Claudes unless
// pruned. A Claude can vanish for a moment (a remote machine dropping, Herdr
// restarting), so a pin goes only after its Claude has been missing for
// PIN_GRACE_MS. Pure: main.js keeps `missing` between polls.

export const PIN_GRACE_MS = 10 * 60_000;

/**
 * @param pins kit.pins (anything not an array counts as none)
 * @param present addresses of the Claudes Herdr lists now
 * @param missing {[address]: firstMissedMs} from the last call
 * @param now epoch ms
 * @returns {{pins: string[], missing: object, changed: boolean}} changed: pins needs writing back
 */
export function prunePins(pins, present, missing, now) {
  if (!Array.isArray(pins)) return { pins: [], missing: {}, changed: false };
  const here = new Set(present);
  const kept = [];
  const nextMissing = {};
  for (const p of pins) {
    if (here.has(p)) { kept.push(p); continue; }
    const since = missing?.[p] ?? now;
    if (now - since >= PIN_GRACE_MS) continue;
    kept.push(p);
    nextMissing[p] = since;
  }
  return { pins: kept, missing: nextMissing, changed: kept.length !== pins.length };
}
