// The add-on contract (docs/addons.md). An add-on is a mod listed in the
// config's `addons`; make-layout gives it a 0-px block beside the strip so it
// runs, and it publishes through these shared keys. herdr-signals reads them
// each poll and the rail draws them; with nothing published, nothing shows.
// Pure: no herdr globals, no I/O.

export const ADDON_KEYS = {
  badges: "kit.addon.badges",
  rows: "kit.addon.rows",
  buttons: "kit.addon.buttons",
  press: "kit.addon.press",
};

const PRESS = "press-";
export const MAX_ROWS = 20;
export const MAX_BUTTONS = 4;
const MAX_SHORT = 40;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v) => typeof v === "string" && v.length > 0;
/**
 * Only web links, with no whitespace or control characters: a click hands the
 * url to open_url. Any other reader of these urls (a Stream Deck plugin hands
 * them to `open`) should use the same rule; tests/support/addon-urls.json holds the cases.
 */
export function goodLink(v) {
  return typeof v === "string" && /^https?:\/\/[^\s\u0000-\u001f\u007f-\u009f]+$/i.test(v);
}
const link = goodLink;
const shortText = (v) => typeof v === "string" && v.length > 0 && [...v].length <= MAX_SHORT;
const optional = (v, ok) => v === undefined || ok(v);

/** A Badge copy, or null when malformed. */
function badge(v) {
  if (!isObj(v) || !text(v.text)) return null;
  if (!optional(v.url, link) || !optional(v.tone, (t) => t === "bright" || t === "dim")) return null;
  if (!optional(v.action, (a) => isObj(a) && text(a.id) && typeof a.tip === "string")) return null;
  if (!optional(v.short, shortText)) return null;
  const out = { text: v.text };
  if (v.short !== undefined) out.short = v.short;
  if (v.url !== undefined) out.url = v.url;
  if (v.tone !== undefined) out.tone = v.tone;
  if (v.action !== undefined) out.action = { id: v.action.id, tip: v.action.tip };
  return out;
}

function row(v) {
  if (!isObj(v) || !text(v.id) || !text(v.text)) return null;
  if (!optional(v.sub, (s) => typeof s === "string") || !optional(v.url, link)) return null;
  const out = { id: v.id, text: v.text };
  if (v.sub !== undefined) out.sub = v.sub;
  if (v.url !== undefined) out.url = v.url;
  return out;
}

function button(v) {
  if (!isObj(v) || !text(v.id) || !text(v.glyph) || !text(v.label) || typeof v.tip !== "string") return null;
  return { id: v.id, glyph: v.glyph, label: v.label, tip: v.tip };
}

/** Up to `max` good entries of `list`, first id winning; a throwing entry is dropped. */
function keepList(list, parse, max) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const v of list) {
    if (out.length >= max) break;
    let e = null;
    try { e = parse(v); } catch { e = null; }
    if (e && !seen.has(e.id)) { seen.add(e.id); out.push(e); }
  }
  return out;
}

/**
 * One key's items, if its envelope ({at, items}) was published at or after
 * `since` (the core's start: shared state outlives a restart, and a terminal
 * address can come back as a different Claude). Else undefined.
 */
function itemsOf(env, since) {
  if (!isObj(env)) return undefined;
  const at = env.at;
  if (typeof at !== "number" || !Number.isFinite(at) || at < since) return undefined;
  return env.items;
}

/**
 * What add-ons published, checked: `raw` is {badges, rows, buttons}, each as
 * read from ADDON_KEYS, an envelope {at, items}. A key stamped before `since`
 * (or without a numeric stamp) counts as empty. Anything malformed is
 * dropped; it never throws.
 * @returns {{badges: {[address: string]: object}, rows: object[], buttons: object[]}}
 */
export function readAddon(raw, since = 0) {
  const out = { badges: {}, rows: [], buttons: [] };
  try {
    if (!isObj(raw)) return out;
    const badges = itemsOf(raw.badges, since);
    if (isObj(badges)) {
      for (const [addr, v] of Object.entries(badges)) {
        if (addr === "__proto__") continue; // JSON.parse makes it an own key; assigning it would swap the prototype
        let b = null;
        try { b = badge(v); } catch { b = null; }
        if (b) out.badges[addr] = b;
      }
    }
    out.rows = keepList(itemsOf(raw.rows, since), row, MAX_ROWS);
    out.buttons = keepList(itemsOf(raw.buttons, since), button, MAX_BUTTONS);
  } catch {
    return { badges: {}, rows: [], buttons: [] };
  }
  return out;
}

/**
 * Names with add-on badges: a badged Claude's hint becomes the badge's text,
 * and `rawHint` keeps the hint it had. Addresses not in `names` are ignored.
 */
export function withBadges(names, badges) {
  const out = {};
  for (const [addr, n] of Object.entries(names)) {
    const b = isObj(badges) && Object.hasOwn(badges, addr) ? badges[addr] : null;
    out[addr] = b ? { ...n, hint: b.text, rawHint: n.rawHint ?? n.hint ?? null, badge: b } : n;
  }
  return out;
}

// A mod folder name: no path parts or spaces.
const MOD = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** One 0-px block per add-on both listed in `addons` and present in `present`, in config order. Never hidden: a hidden block never starts its mod. */
export function addonBlocks(addons, present) {
  if (!Array.isArray(addons) || !Array.isArray(present)) return [];
  const have = new Set(present);
  const out = [];
  for (const name of addons) {
    if (typeof name !== "string" || !MOD.test(name) || !have.has(name) || out.some((b) => b.content.mod === name)) continue;
    out.push({ id: `addon-${name}`, type: "block", size: { px: 0 }, content: { mod: name } });
  }
  return out;
}

/**
 * A copy of `layout` with `blocks` right after the herdr-signals strip, as its
 * siblings (not under the root, where a 0-px block would add a divider). Old
 * add-on blocks are replaced. No strip, no change.
 */
export function withAddons(layout, blocks) {
  const out = JSON.parse(JSON.stringify(layout));
  const parentOf = (n) => {
    if (!isObj(n) || !Array.isArray(n.children)) return null;
    if (n.children.some((c) => isObj(c) && c.id === "signals")) return n;
    for (const c of n.children) { const p = parentOf(c); if (p) return p; }
    return null;
  };
  const parent = parentOf(out);
  if (!parent) return out;
  const kept = parent.children.filter((c) => !(isObj(c) && typeof c.id === "string" && c.id.startsWith("addon-")));
  const at = kept.findIndex((c) => isObj(c) && c.id === "signals") + 1;
  parent.children = [...kept.slice(0, at), ...JSON.parse(JSON.stringify(blocks)), ...kept.slice(at)];
  return out;
}

/** The id a `press-<id>` mod command presses, else null (Herdr passes a mod command only as a string). */
export function pressCommand(c) {
  return typeof c === "string" && c.startsWith(PRESS) && c.length > PRESS.length ? c.slice(PRESS.length) : null;
}

/** A Claude's name on the Discord away card: `name (short)` when its badge has a short, else the name. */
export function cardName(n) {
  const short = n?.badge?.short;
  return short ? `${n.name} (${short})` : n?.name;
}

/** The focused Claude's badge as the Stream Deck gets it: {text, url, short}, nulls for the missing parts. */
export function deckBadge(b) {
  return b ? { text: b.text, url: b.url ?? null, short: b.short ?? null } : null;
}
