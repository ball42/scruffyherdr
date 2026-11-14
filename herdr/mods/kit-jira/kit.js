// kit-jira's side of the add-on contract (docs/addons.md): the shared key
// names, the {at, items} envelope, its config, when to publish and poll, and
// where to look for acli. Pure: no herdr globals, no I/O.
import { siteUrl, validProjects } from "./tickets.js";

// A mod can't import herdr-signals/addons.js, so the names are literals.
// kit-jira writes `badges` and `rows` only (never `buttons` or `press`), and
// with `jira_publish` off it writes neither: only its own `feed`.
export const KEYS = {
  badges: "kit.addon.badges",
  rows: "kit.addon.rows",
  feed: "kit.jira",
};

export const TICK_MS = 2000; // herdr-signals' default poll
// Well under the contract's 60 s: a herdr-signals reload resets its start, and
// what was published before it is ignored until the next copy.
export const REPUBLISH_MS = 15_000;
export const SEARCH_MS = 60_000; // Jira status drifts slowly
export const MINE_MS = 300_000; // the list only changes when tickets are assigned or moved

export const NAME = "kit-jira";

export const DEFAULTS = {
  jira_url: "",
  acli: "",
  jira_projects: [],
  jira_mine: false,
  jira_mine_jql: 'assignee = currentUser() AND statusCategory = "In Progress" ORDER BY updated DESC',
  jira_publish: true,
};

// Herdr is a GUI app, so its PATH may miss Homebrew's folders: look there first.
export const ACLI_PLACES = ["/opt/homebrew/bin/acli", "/usr/local/bin/acli", "acli"];

/**
 * The user's config.json text -> {cfg, listed, problems}. `listed` is whether
 * `addons` names kit-jira: unlisted, the mod does nothing at all. A bad value
 * keeps its default and adds a problem line.
 */
export function readJiraConfig(text) {
  const problems = [];
  let user = {};
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) user = parsed;
      else problems.push("config.json isn't a JSON object");
    } catch {
      problems.push("config.json isn't valid JSON");
    }
  }
  const cfg = { ...DEFAULTS, jira_projects: [] };
  if ("jira_url" in user) {
    cfg.jira_url = siteUrl(user.jira_url);
    if (!cfg.jira_url && user.jira_url !== "") problems.push("jira_url isn't an http(s) address; badges carry no link");
  }
  if (typeof user.acli === "string") cfg.acli = user.acli.trim();
  if ("jira_projects" in user) {
    cfg.jira_projects = validProjects(user.jira_projects);
    if (!Array.isArray(user.jira_projects)) problems.push("jira_projects isn't a list; every project is searched");
  }
  for (const k of ["jira_mine", "jira_publish"]) if (typeof user[k] === "boolean") cfg[k] = user[k];
  if (typeof user.jira_mine_jql === "string" && user.jira_mine_jql.trim()) cfg.jira_mine_jql = user.jira_mine_jql.trim();
  const listed = Array.isArray(user.addons) && user.addons.includes(NAME);
  return { cfg, listed, problems };
}

/** Where to run acli from, in order: the config's path alone, else ACLI_PLACES. */
export function acliPlaces(cfg) {
  return cfg?.acli ? [cfg.acli] : [...ACLI_PLACES];
}

/** One key's value as the contract wants it. */
export function envelope(items, at) {
  return { at, items };
}

/**
 * kit.jira, for an add-on that owns the badge and row keys itself: the
 * tickets the Claudes are named after, each Claude's key, and what kit-jira
 * would publish.
 */
export function feed(tickets, keys, items, rowItems, at) {
  return { at, tickets, keys, badges: items, rows: rowItems };
}

/** The model's agents (shared("herdr-kit").agents), or [] for anything else. */
export function modelAgents(model) {
  const list = model && typeof model === "object" ? model.agents : null;
  return Array.isArray(list) ? list.filter((a) => a && typeof a === "object" && typeof a.address === "string") : [];
}

/** Publish a key when its value changed, or its last copy is getting old. */
export function publishDue(sig, last, now) {
  return !last || sig !== last.sig || now - last.at >= REPUBLISH_MS;
}

/** Search when there are keys and acli is usable: on a new key set, else once a minute. */
export function searchDue(keys, last, now) {
  if (!keys.length || last.busy || last.off) return false;
  return keys.join(",") !== last.sig || now - last.at >= SEARCH_MS;
}

/** "My tickets" right away, then every 5 minutes. */
export function mineDue(last, now) {
  if (last.busy || last.off) return false;
  return last.at === null || now - last.at >= MINE_MS;
}

/**
 * Whether an exec rejection means the program isn't there (exec "can't start"
 * it). Only that moves on to the next place; a timeout or any other failure is retried.
 */
export function isMissing(e) {
  const text = `${e?.code ?? ""} ${e?.message ?? e ?? ""}`;
  return /ENOENT|No such file or directory/i.test(text);
}

/** The fields the badges are built from, so a new model only republishes when they move. */
export function badgeSig(agents) {
  return JSON.stringify(agents.map((a) => [a.address, a.name ?? null, a.rawHint ?? null, a.pr ?? null]));
}
