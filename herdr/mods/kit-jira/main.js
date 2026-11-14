// kit-jira: an add-on (docs/addons.md) that badges each Claude named after a
// Jira ticket (/rename ACME-12 ...) with the ticket's status, its PR's state
// when pr_status is on, and its summary, and, with `jira_mine` on, lists my
// tickets no Claude is on as rail rows. It draws nothing: it runs in the 0-px
// block make-layout gives it beside the strip, and only while config `addons`
// lists it. Jira is read through Atlassian's acli; without acli it publishes
// empty values and stops. The rest of this folder is pure (tickets.js, kit.js).
import { View, div } from "gpui-kit";
import { exec, home, readTextFile, setShared, shared } from "herdr";
import {
  KEYS, MINE_MS, NAME, SEARCH_MS, TICK_MS, acliPlaces, badgeSig, envelope, feed, isMissing, mineDue, modelAgents, publishDue, readJiraConfig, searchDue,
} from "./kit.js";
import { agentKeys, badges, mineArgs, parseSearch, rows, searchArgs, ticketKeys } from "./tickets.js";

export default class KitJira extends View {
  init(_props, cx) {
    this.started = Date.now();
    this.cfg = null; // set once config.json is read and lists kit-jira; until then nothing is written
    this.tickets = {};
    this.mine = {};
    this.search = { sig: "", at: 0, busy: false, off: false };
    this.mineRun = { at: null, busy: false, off: false };
    this.places = [];
    this.place = 0; // the index in `places` of the acli being tried
    this.published = {}; // key -> {sig, at} of its last publish
    this.modelSig = null;
    this.failed = { search: null, mine: null };
    cx.spawn(async () => this.loadConfig());
    cx.timer.every(TICK_MS, (cx) => this.tick(cx));
  }

  // Unlisted in `addons`, kit-jira writes nothing, so it can't clobber another add-on's keys.
  async loadConfig() {
    let text = null;
    try {
      text = await readTextFile(`${home()}/.config/herdr-kit/config.json`);
    } catch { /* no config: unlisted */ }
    const { cfg, listed, problems } = readJiraConfig(text);
    if (!listed) return;
    for (const p of problems) console.log(`${NAME}: ${p}`);
    this.cfg = cfg;
    this.places = acliPlaces(cfg);
    // The contract: empty values first, so a past session's badges are gone at once.
    this.publish([], this.started);
  }

  acli() {
    return this.places[this.place];
  }

  // Every TICK_MS: the acli searches when due, then publish.
  tick(cx) {
    if (!this.cfg) return;
    const now = Date.now();
    const list = modelAgents(shared("herdr-kit"));
    const keys = ticketKeys(list, this.cfg.jira_projects);
    if (searchDue(keys, this.search, now)) this.refreshTickets(cx, keys);
    if (this.cfg.jira_mine && mineDue(this.mineRun, now)) this.refreshMine(cx);
    this.publish(list, now);
  }

  // Badges and rows come only from the model read now, never a saved agent list.
  // Each key goes out when it changed, or when its last copy is getting old
  // (herdr-signals ignores a copy older than its own start, docs/addons.md).
  // With `jira_publish` off, another add-on owns the badge and row keys, and
  // kit-jira writes only its feed.
  publish(list, now) {
    const { jira_url: site, jira_projects: projects } = this.cfg;
    const values = {
      badges: badges(list, this.tickets, site, projects),
      rows: this.cfg.jira_mine ? rows(this.mine, list, site, projects) : [],
    };
    const out = { feed: feed(this.tickets, agentKeys(list, projects), values.badges, values.rows, now) };
    if (this.cfg.jira_publish) {
      out.badges = envelope(values.badges, now);
      out.rows = envelope(values.rows, now);
    }
    for (const [k, v] of Object.entries(out)) {
      const sig = JSON.stringify({ ...v, at: 0 });
      if (!publishDue(sig, this.published[k], now)) continue;
      this.published[k] = { sig, at: now };
      setShared(KEYS[k], v);
    }
  }

  // A failed search is logged when its error changes, and retried at its next turn.
  noteFailure(kind, why) {
    if (why !== this.failed[kind]) console.log(`${NAME}: acli ${kind} failed: ${why}`);
    this.failed[kind] = why;
  }

  // An exec rejection. A missing acli moves on to the next place, and past the
  // last one turns both searches off until a restart; anything else is retried.
  acliRejected(kind, e, tried) {
    if (!isMissing(e)) { this.noteFailure(kind, String(e)); return; }
    if (this.search.off || tried !== this.acli()) return; // already moved on
    this.place += 1;
    if (this.place < this.places.length) {
      this.search.sig = ""; // try the next place on the next tick
      this.mineRun.at = null;
      return;
    }
    console.log(`${NAME}: acli not found (tried ${this.places.join(", ")}); Jira badges are off until Herdr restarts. Set config "acli" to its path.`);
    this.search.off = true;
    this.mineRun.off = true;
    this.tickets = {};
    this.mine = {};
    this.published = {}; // publish the empty badges and rows next tick
  }

  // One acli search for every named ticket. Runs beside the tick so a slow Jira never stalls it.
  // A failed batch (one unknown key fails Jira's whole `key in (...)`) falls
  // back to one search per key, so the good keys still badge. Any failure keeps
  // the last tickets it had.
  refreshTickets(cx, keys) {
    const sig = keys.join(",");
    const acli = this.acli();
    this.search.busy = true;
    cx.spawn(async () => {
      let retry = false;
      try {
        const r = await exec(acli, searchArgs(keys));
        if (r.code === 0) { this.tickets = parseSearch(r.stdout); this.failed.search = null; }
        else {
          const why = r.stderr.trim() || `exit ${r.code}`;
          if (keys.length < 2) this.noteFailure("search", why);
          else await this.searchEach(acli, keys, why);
        }
      } catch (e) {
        this.acliRejected("search", e, acli);
        retry = acli !== this.acli();
      } finally {
        this.search.sig = retry ? "" : sig; // retry on the minute, not every tick
        this.search.at = Date.now();
        this.search.busy = false;
      }
    });
  }

  async searchEach(acli, keys, why) {
    const got = {};
    const bad = [];
    for (const k of keys) {
      const r = await exec(acli, searchArgs([k]));
      if (r.code === 0) Object.assign(got, parseSearch(r.stdout));
      else bad.push(k);
    }
    if (bad.length === keys.length) { this.noteFailure("search", why); return; }
    if (bad.length) this.noteFailure("search", `no ticket for ${bad.join(", ")} (set jira_projects to skip names like these)`);
    else this.failed.search = null;
    this.tickets = got;
  }

  refreshMine(cx) {
    const acli = this.acli();
    this.mineRun.busy = true;
    cx.spawn(async () => {
      let retry = false;
      let failed = false;
      try {
        const r = await exec(acli, mineArgs(this.cfg.jira_mine_jql));
        if (r.code === 0) { this.mine = parseSearch(r.stdout); this.failed.mine = null; }
        else { this.noteFailure("mine", r.stderr.trim() || `exit ${r.code}`); failed = true; }
      } catch (e) {
        this.acliRejected("mine", e, acli);
        retry = acli !== this.acli();
        failed = true;
      } finally {
        // A failure is retried in a minute, not five.
        this.mineRun.at = retry ? null : failed ? Date.now() - MINE_MS + SEARCH_MS : Date.now();
        this.mineRun.busy = false;
      }
    });
  }

  // Every setShared re-renders every mod: a new model republishes what it
  // changed, in a task (render mustn't set shared state).
  render(cx) {
    if (this.cfg) {
      const sig = badgeSig(modelAgents(shared("herdr-kit")));
      if (sig !== this.modelSig) {
        this.modelSig = sig;
        cx.spawn(async () => this.publish(modelAgents(shared("herdr-kit")), Date.now()));
      }
    }
    return div();
  }
}
