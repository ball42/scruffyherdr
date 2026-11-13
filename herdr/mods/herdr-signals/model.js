// The view model every herdr-kit mod draws from (published with setShared).
// Attention: blocked flares once (`since`) and pulses until the user has focused
// it; done is steady. Pure: no herdr globals, no I/O.
import { focusHolds } from "./focus.js";
import { snoozeInfo } from "./snooze.js";

const RANK = { blocked: 0, done: 1, working: 2, idle: 3 };
const rank = (status) => RANK[status] ?? 4;
const ASKS_STALE_MS = 30 * 60_000;

/** True once a card first shown at `at` has gone unanswered for 30 minutes. */
export function cardStale(at, now) {
  return typeof at === "number" && now - at >= ASKS_STALE_MS;
}
// Waiting on a decision ranks between blocked and done: it stops work, a finished Claude doesn't.
const rowRank = (r) => (r.status !== "working" && r.status !== "blocked" && r.card ? 0.5 : rank(r.status));

/** True for a "run" card whose runs all finished with exit 0 and no Ask is left. */
function allRan(card, runs, asks) {
  return card === "run" && runs.length > 0 && !(asks ?? []).length &&
    runs.every((r) => r.state?.state === "done" && r.state.exit === 0);
}

/** Per-address attention: {kind: "blocked"|"done"|null, since, seen}. */
export function attentionStep(prev, agents, now) {
  const next = {};
  for (const a of agents) {
    const p = prev[a.address];
    if (a.status === "blocked") {
      const same = p && p.kind === "blocked";
      next[a.address] = { kind: "blocked", since: same ? p.since : now, seen: (same && p.seen) || a.focused };
    } else if (a.status === "done") {
      next[a.address] = { kind: "done", since: p && p.kind === "done" ? p.since : now, seen: false };
    } else {
      next[a.address] = { kind: null, since: null, seen: false };
    }
  }
  return next;
}

/**
 * @param agents [{address, tab, space, space_name, status, seq}]
 * @param names {[address]: {name, hint, rawHint?, badge?, pr?, session?}} from resolveNames, then PR state and add-on badges
 * @param attention from attentionStep
 * @param currentSpace the shown space's id
 * @param snooze kit.snooze ({[address]: untilEpochMs | {done: atMs}}, see snooze.js); a snoozed Claude never pulses
 * @param now epoch ms, for judging `snooze`
 * @param pins [address] pinned Claudes
 * @param git {[address]: {branch, pr}}
 * @param runstate {["<address>-<run id>"]: {state, exit, terminal, log, since}} from readRunState
 * @param focus kit.focus ({since} while focus mode is on, see focus.js)
 */
export function buildModel(agents, names, attention, currentSpace, snooze = {}, now = 0, pins = [], git = {}, runstate = {}, focus = null) {
  const rows = agents.map((a) => {
    const att = attention[a.address] ?? { kind: null, since: null, seen: false };
    const n = names[a.address] ?? { name: a.address, hint: null };
    const sz = snoozeInfo(snooze[a.address], now);
    // Focus mode holds a done Claude like a snooze: dimmed, no alert from the kit.
    const held = focusHolds(focus, a.status);
    const snoozed = sz.snoozed || held;
    // Run cards with the state their run last wrote.
    const runs = (n.runs ?? []).map((r) => ({ ...r, state: (r.id && runstate[`${a.address}-${r.id}`]) || null }));
    return {
      address: a.address,
      tab: a.tab,
      space: a.space,
      space_name: a.space_name,
      name: n.name,
      hint: n.hint,
      // The names file's hint, before PR state or an add-on badge replaced it.
      rawHint: n.rawHint ?? n.hint ?? null,
      // An add-on's badge (addons.js): the hint line's tone, link and right-click action.
      badge: n.badge ?? null,
      pr: n.pr ?? null,
      // The Claude Code session id, from the names file (add-ons key records on it).
      session: n.session ?? null,
      card_stale: cardStale(n.card_at ?? null, now),
      ask: a.status === "blocked" ? (n.ask ?? null) : null,
      // The menu and permission prompt the user is answering, only while blocked.
      menu: a.status === "blocked" ? (n.menu ?? null) : null,
      perm: a.status === "blocked" ? (n.perm ?? null) : null,
      // The reply's closing question, while the Claude is done or idle.
      ask_text: a.status === "done" || a.status === "idle" ? (n.ask_text ?? null) : null,
      // What its last reply said (prose before the action items), for the rail's peek.
      said: a.status === "done" || a.status === "idle" ? (n.said ?? null) : null,
      // Waiting on the user: blocked, or finished (done/idle) with a card still open.
      // A Run card whose every run went clean has nothing left to ask.
      card: (a.status === "blocked" || a.status === "done" || a.status === "idle") && !allRan(n.card, runs, n.asks) ? (n.card ?? null) : null,
      asks: n.asks ?? [],
      // Run cards with a command, for the Run and Copy buttons, each with the
      // state its run last wrote. The hook clears them on a real prompt.
      runs,
      tool: a.status === "working" ? (n.tool ?? null) : null,
      ctx_left: n.ctx_left ?? null,
      snoozed,
      snooze_until: sz.snooze_until,
      snooze_till_done: sz.snooze_till_done,
      snooze_focus: held,
      pinned: pins.includes(a.address),
      status: a.status,
      seq: a.seq ?? 0,
      attention: { kind: att.kind, since: att.since, pulse: att.kind === "blocked" && !att.seen && !snoozed },
    };
  });
  // Spaces after the current one go by their most urgent Claude, so a Claude
  // that needs you is never below a row of idle spaces. A snoozed Claude
  // counts as idle here: it asked not to be lifted.
  const spaceRank = {};
  for (const r of rows) {
    const k = r.snoozed ? RANK.idle : rowRank(r);
    spaceRank[r.space] = Math.min(spaceRank[r.space] ?? Infinity, k);
  }
  rows.sort((x, y) =>
    (x.space === currentSpace ? 0 : 1) - (y.space === currentSpace ? 0 : 1) ||
    spaceRank[x.space] - spaceRank[y.space] ||
    x.space_name.localeCompare(y.space_name) ||
    String(x.space).localeCompare(String(y.space)) ||
    rowRank(x) - rowRank(y) ||
    y.seq - x.seq);

  const perTab = {};
  for (const r of rows) perTab[r.tab] = (perTab[r.tab] ?? 0) + 1;
  const tabs = {};
  for (const r of rows) {
    // rows are urgency-sorted, so the first one seen per tab is its most urgent.
    // A split tab keeps its own label (name null); only the glyph follows urgency.
    if (!tabs[r.tab]) tabs[r.tab] = { name: perTab[r.tab] === 1 ? r.name : null, kind: r.attention.kind, pulse: r.attention.pulse, since: r.attention.since };
  }
  return { v: 1, current_space: currentSpace, agents: rows.map(({ seq, ...r }) => r), tabs };
}

/** Addresses in rail order, for setAgentOrder (cmd-] / cmd-[ follow the rail). */
/** The Claude "most urgent" goes to (cmd-shift-u, a strip count click): the
 *  first blocked one, else the first done one, skipping snoozed. Model order. */
export function urgentHit(agents) {
  const live = (agents ?? []).filter((a) => !a.snoozed);
  return live.find((a) => a.attention.kind === "blocked") ?? live.find((a) => a.attention.kind === "done") ?? null;
}

export function urgencyOrder(model) {
  return model.agents.map((a) => a.address);
}

/** Pure decision for auto-spotlight. `handled` is {[address]: since} of blocked
 * Claudes already dealt with. A Claude that became blocked (its `since`
 * changed), is unseen and not snoozed gets spotlighted once the user has been
 * idle `minIdle` s; until then it stays pending. When off, or not in the grid,
 * everything counts as handled so no backlog fires later.
 * @returns {{pick: string|null, handled: object}}
 */
export function autoSpotlight(handled, agents, { enabled, grid, idle, minIdle = 5 }) {
  const next = {};
  let pick = null;
  const active = enabled && grid;
  const live = active && idle !== null && idle >= minIdle;
  for (const a of agents) {
    if (a.attention.kind !== "blocked") continue;
    const fresh = handled[a.address] !== a.attention.since;
    const eligible = active && fresh && !a.snoozed && a.attention.pulse;
    if (eligible && !live) continue; // pending: re-qualifies when the user is idle
    if (eligible && pick === null) pick = a.address;
    next[a.address] = a.attention.since;
  }
  return { pick, handled: next };
}

/**
 * Tracks what happened while away. `track` starts null. Each poll pass the
 * snapshot [{address, name, status, snoozed}] and whether the user is away.
 * On the away -> present edge `report` is {done:[names], blocked:[names]}
 * (lists may be empty), else null.
 */
export function awayStep(track, snapshot, away) {
  const t = track ?? { away: false, last: {}, done: {}, blocked: {} };
  const last = {};
  const done = { ...t.done };
  const blocked = { ...t.blocked };
  for (const a of snapshot) {
    if (a.snoozed) continue;
    last[a.address] = a.status;
    if (!away) continue;
    const prev = t.last[a.address];
    if (a.status === "blocked" && prev !== "blocked") blocked[a.address] = a.name;
    if ((a.status === "done" || a.status === "idle") && (prev === "working" || prev === "blocked")) done[a.address] = a.name;
  }
  if (away) return { track: { away: true, last, done, blocked }, report: null };
  const fresh = { away: false, last, done: {}, blocked: {} };
  if (!t.away) return { track: fresh, report: null };
  const stillBlocked = new Set(snapshot.filter((a) => a.status === "blocked" && !a.snoozed).map((a) => a.address));
  const report = {
    done: Object.keys(done).filter((k) => !stillBlocked.has(k)).map((k) => done[k]),
    blocked: Object.keys(blocked).filter((k) => stillBlocked.has(k)).map((k) => blocked[k]),
  };
  return { track: fresh, report };
}

/** {title, body} for the toast, or null when there is nothing to say. */
export function awayToast(report) {
  if (!report || (!report.done.length && !report.blocked.length)) return null;
  const parts = [];
  if (report.done.length) parts.push(`✓ ${report.done.length} done: ${report.done.join(", ")}`);
  if (report.blocked.length) parts.push(`✋ ${report.blocked.length} waiting: ${report.blocked.join(", ")}`);
  return { title: "While you were away", body: parts.join(" · ") };
}

const RUN_STATES = new Set(["running", "done", "skipped"]);

/**
 * A run state file (runstate/<address>-<id>.json, written by the ▶ Run
 * script) as {state, exit, terminal, log, since}, or null when it isn't one.
 * `since` is when a running step started (epoch ms, from the file's `at`
 * seconds), else null.
 */
export function readRunState(d) {
  if (!d || typeof d !== "object" || !RUN_STATES.has(d.state)) return null;
  const exit = Number.isInteger(d.exit) ? d.exit : null;
  if (d.state === "done" && exit === null) return null;
  return {
    state: d.state, exit, terminal: typeof d.terminal === "string" ? d.terminal : null,
    log: typeof d.log === "string" && d.log ? d.log : null,
    since: d.state === "running" && Number.isFinite(d.at) && d.at > 0 ? d.at * 1000 : null,
  };
}
