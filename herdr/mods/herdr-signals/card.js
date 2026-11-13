// Decides when Discord hears about agents, and what the message looks like.
// One card per stretch away from this Mac: the first item posts it (one phone
// buzz), later changes edit it in place (Discord doesn't notify edits).
// Pure: no herdr globals, no I/O.

const ORANGE = 0xec8e2c;
const BLUE = 0x58a6ff;
const MAX_DESCRIPTION = 4000;
const MAX_ASK = 120;
// The input-kind glyphs the rail uses (kit-rail/look.js CARD_GLYPHS).
const CARD_GLYPHS = { run: "▶", decide: "◆", ask: "?" };

/** A blocked Claude's question, on one line, cut to MAX_ASK characters. */
export function askLine(ask) {
  if (typeof ask !== "string") return "";
  const one = ask.replace(/\s+/g, " ").trim();
  return one.length > MAX_ASK ? `${one.slice(0, MAX_ASK - 1).trimEnd()}…` : one;
}

export function initialCardState() {
  return { started: false, agents: {}, episode: null };
}

/**
 * One poll. `snapshot` is [{address, status, name, focused, ask?, card?}], `now` ms,
 * `cfg` is {away, graceSeconds, doneMinSeconds, snoozed?}. Snoozed rows (a
 * `snoozed` flag, or an address in cfg.snoozed) are ignored entirely.
 * @returns {{state: object, action: null | {type: "post"|"edit", items: object[]}}}
 */
export function cardStep(state, snapshot, now, cfg) {
  const agents = {};
  const finished = [];

  for (const a of snapshot) {
    const prev = state.agents[a.address];
    const prevStatus = prev ? prev.status : null;
    let workingSince = prev ? prev.workingSince : null;
    let blockedSince = prev ? prev.blockedSince : null;
    // Blocked before the mod started counts as already sent.
    let skip = prev ? prev.skip : !state.started && a.status === "blocked";
    if (prev && a.status !== prevStatus) skip = false;

    // A permission prompt mid-turn (working → blocked → working) keeps the turn's start.
    if (a.status === "working" && prevStatus !== "working" && prevStatus !== "blocked") workingSince = now;
    if (a.status === "working" && workingSince === null) workingSince = now;
    if (a.status === "blocked" && prevStatus !== "blocked") blockedSince = now;
    if (a.status !== "blocked") blockedSince = null;

    // Herdr reports "idle" instead of "done" when the tab is focused, so both end a turn.
    if (
      state.started && prevStatus === "working" && (a.status === "done" || a.status === "idle") &&
      workingSince !== null && now - workingSince >= cfg.doneMinSeconds * 1000
    ) {
      finished.push({ address: a.address, kind: "done", name: a.name, minutes: Math.round((now - workingSince) / 60000) });
    }

    if (a.status !== "working" && a.status !== "blocked") workingSince = null;
    agents[a.address] = { status: a.status, workingSince, blockedSince, skip };
  }

  const next = { started: true, agents, episode: state.episode };
  if (!state.started || !cfg.away) {
    next.episode = null; // being here ends the stretch; the next one gets a new card
    return { state: next, action: null };
  }

  const blocked = snapshot
    .filter((a) => {
      const s = agents[a.address];
      return a.status === "blocked" && !s.skip && s.blockedSince !== null &&
        now - s.blockedSince >= cfg.graceSeconds * 1000;
    })
    .map((a) => ({ address: a.address, kind: "blocked", name: a.name, ask: a.ask ?? null, card: a.card ?? null, since: agents[a.address].blockedSince }));
  const done = [...(state.episode ? state.episode.items.filter((i) => i.kind === "done") : []), ...finished];
  const items = [...blocked, ...done];
  if (items.length === 0) return { state: next, action: null };

  if (!state.episode) {
    next.episode = { items, since: now, messageId: null };
    return { state: next, action: { type: "post", items } };
  }
  next.episode = { ...state.episode, items };
  const sig = (xs) => xs.map((i) => `${i.kind}:${i.address}:${i.name}:${i.card ?? ""}:${i.ask ?? ""}`).join("|");
  if (sig(items) === sig(state.episode.items)) return { state: next, action: null };
  return { state: next, action: { type: "edit", items } };
}

/**
 * " · <t:1794267210:R>": Discord draws it as "12 minutes ago" and keeps it
 * current in the app, so the card stays right without an edit per minute.
 */
export function waitedTag(since) {
  return typeof since === "number" && Number.isFinite(since) ? ` · <t:${Math.floor(since / 1000)}:R>` : "";
}

function clock(ms) {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The webhook body: one embed, blocked lines first, orange if anything is blocked. */
export function buildCard(items, since) {
  const blocked = items.filter((i) => i.kind === "blocked");
  const done = items.filter((i) => i.kind === "done");
  const title = [
    blocked.length ? `✋ ${blocked.length} ${blocked.length === 1 ? "needs" : "need"} you` : null,
    done.length ? `✓ ${done.length} done` : null,
  ].filter(Boolean).join(" · ");

  const lines = [
    ...blocked.map((i) => {
      const g = CARD_GLYPHS[i.card] ? `${CARD_GLYPHS[i.card]} ` : "";
      const ask = askLine(i.ask);
      return `✋ ${g}**${i.name}**${ask ? ` · ${ask}` : ""}${waitedTag(i.since)}`;
    }),
    ...done.map((i) => `✓ **${i.name}** — finished after ${i.minutes} min`),
  ];
  let description = "";
  for (let n = 0; n < lines.length; n++) {
    const rest = lines.length - n - 1;
    const candidate = description ? `${description}\n${lines[n]}` : lines[n];
    const tail = rest > 0 ? `\n… and ${rest} more` : "";
    if ((candidate + tail).length > MAX_DESCRIPTION) {
      description = `${description}\n… and ${lines.length - n} more`;
      break;
    }
    description = candidate;
  }

  return {
    username: "Herdr",
    allowed_mentions: { parse: [] },
    embeds: [{
      title,
      description,
      color: blocked.length ? ORANGE : BLUE,
      footer: { text: `since ${clock(since)}` },
      timestamp: new Date(since).toISOString(),
    }],
  };
}
