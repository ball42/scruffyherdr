// Counts for the strip and the Stream Deck. Discord rules live in card.js.
// Pure: no herdr globals, no I/O.

const MAX_DECK_AGENTS = 5;

/**
 * Counts for the strip and the Stream Deck; `top` is the most urgent address
 * and `top_name` its herdr-kit name (null when it has none); `top_since` and
 * each row's `since` are when a blocked or done Claude started waiting (ms). Snoozed Claudes
 * (row `snoozed` flag, or listed in `snoozed`, a Set/array of addresses) are
 * left out of everything. `agents` is up to 5 rows in snapshot (rail) order.
 */
export function summary(snapshot, snoozed = []) {
  const muted = new Set(snoozed);
  const live = snapshot.filter((a) => !a.snoozed && !muted.has(a.address));
  // Done Claudes held back by focus mode: counted apart, muted, never alerting.
  const held = snapshot.filter((a) => a.snooze_focus && a.status === "done").length;
  const blocked = live.filter((a) => a.status === "blocked");
  const done = live.filter((a) => a.status === "done");
  const first = blocked[0] ?? done[0] ?? null;
  return {
    blocked: blocked.length,
    done: done.length,
    held,
    top: first?.address ?? null,
    top_name: first?.name ?? null,
    top_card: first?.card ?? null,
    top_since: first?.attention?.since ?? null,
    // When the longest-waiting blocked Claude started waiting (the strip's age).
    oldest_since: oldestSince(blocked),
    agents: live.slice(0, MAX_DECK_AGENTS).map((a) => ({
      address: a.address,
      name: a.name ?? null,
      kind: a.status === "blocked" || a.status === "done" ? a.status : null,
      status: a.status,
      card: a.card ?? null,
      since: a.status === "blocked" || a.status === "done" ? (a.attention?.since ?? null) : null,
    })),
  };
}

function oldestSince(rows) {
  const times = rows.map((a) => a.attention?.since).filter((n) => typeof n === "number");
  return times.length ? Math.min(...times) : null;
}

/**
 * Open asks: Claudes with a card that aren't working or snoozed, and
 * the first one in rail order that isn't `focusedAddr` (so each press moves on).
 */
export function deckAsks(snapshot, focusedAddr) {
  const asking = snapshot.filter((a) => !a.snoozed && a.status !== "working" && Boolean(a.card));
  const count = asking.length;
  const next = asking.find((a) => a.address !== focusedAddr) ?? asking[0] ?? null;
  return { count, next: next?.address ?? null };
}

/**
 * The usage meter for the Stream Deck, from usage.js's view: each window as
 * `{used, reset, over}` (`used` null once the window has reset), the projected
 * `out` time and `stale`. Null without a meter.
 */
export function deckUsage(view) {
  if (!view) return null;
  const win = (w) => (w ? { used: w.used, reset: w.reset, over: w.over } : null);
  return { five: win(view.five), week: win(view.week), out: view.outTime, stale: view.stale };
}
