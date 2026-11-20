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

/**
 * Largest report the Stream Deck takes, in UTF-8 bytes: herdr-kit's deck
 * plugin answers 413 to a longer one (streamdeck/src/server.ts MAX_BODY),
 * which freezes every key, not just the one whose field ran long.
 */
export const DECK_MAX_BODY = 4096;
// The deck drops an agent or approve offer whose name is over 40 code points.
const DECK_NAME_MAX = 40;
// What a key draws of a name (render.ts clips to 10).
const DECK_NAME_SHORT = 10;

/** `s` cut to `max` code points, its last one "…" when it was cut; non-strings pass through. */
function clipCps(s, max) {
  if (typeof s !== "string") return s;
  const cps = [...s];
  return cps.length > max ? `${cps.slice(0, max - 1).join("")}…` : s;
}

/** UTF-8 bytes of `s`, counted without encoding it (no Buffer or TextEncoder in a mod). */
function utf8Bytes(s) {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return n;
}

const fits = (s, max) => utf8Bytes(JSON.stringify(s)) <= max;

function withNames(s, max) {
  const out = { ...s };
  if ("top_name" in s) out.top_name = clipCps(s.top_name, max);
  if (Array.isArray(s.agents)) out.agents = s.agents.map((a) => ({ ...a, name: clipCps(a.name, max) }));
  if (s.approve) out.approve = { ...s.approve, name: clipCps(s.approve.name, max) };
  return out;
}

/**
 * The deck report `s` made to fit in `max` UTF-8 bytes, as a new object.
 * Names over the deck's 40 code points are always clipped, so a long-named
 * Claude keeps its tile. While the report is still over, it drops, in order:
 * the badge's url, then the badge, then clips names to what the keys draw and
 * drops approve's description, then the agent tiles, then the approve offer.
 * Approve's detail is never clipped here: the deck tells one prompt from the
 * next by tool and detail, so a detail that changed with the budget would
 * look like a new prompt (deckApprove already caps it at 120 code points).
 * The counts, `top` and `asks` always land.
 */
export function fitDeck(s, max = DECK_MAX_BODY) {
  let out = withNames(s, DECK_NAME_MAX);
  if (fits(out, max)) return out;
  if (out.badge?.url) out = { ...out, badge: { ...out.badge, url: null } };
  if (fits(out, max)) return out;
  if (out.badge) out = { ...out, badge: null };
  if (fits(out, max)) return out;
  out = withNames(out, DECK_NAME_SHORT);
  if (out.approve) {
    const { description: _dropped, ...rest } = out.approve;
    out.approve = rest;
  }
  if (fits(out, max)) return out;
  out = { ...out, agents: [] };
  if (fits(out, max)) return out;
  return { ...out, approve: null };
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
 * `out` time, `stale`, and `asOf`, the reading's clock time ("2:05p"), so a
 * stale key can say how old it is. Null without a meter.
 */
export function deckUsage(view) {
  if (!view) return null;
  const win = (w) => (w ? { used: w.used, reset: w.reset, over: w.over } : null);
  return { five: win(view.five), week: win(view.week), out: view.outTime, stale: view.stale, asOf: view.asOf };
}
