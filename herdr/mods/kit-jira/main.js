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
  KEYS, MINE_MS, NAME, SEARCH_MS, TICK_MS, acliPlaces, badgeSig, envelope, feed, isMissing, mineDue, modelAgents, publishDue, readJiraConfig, rejectsKey, searchDue, splitKeys,
} from "./kit.js";
import { agentKeys, badges, mineArgs, parseSearch, rows, searchArgs, staleBadges, staleRows, ticketKeys } from "./tickets.js";

export default class KitJira extends View {
  init(_props, cx) {
    this.started = Date.now();
    this.cfg = null; // set once config.json is read and lists kit-jira; until then nothing is written
    this.tickets = {};
    this.mine = {};
    this.search = { sig: "", at: 0, busy: false, off: false };
    this.bad = {}; // key -> when Jira last rejected it on its own (kit.js splitKeys)
    this.mineRun = { at: null, busy: false, off: false };
    this.places = [];
    this.place = 0; // the index in `places` of the acli being tried
    this.published = {}; // key -> {sig, at} of its last publish
    this.modelSig = null;
    this.failed = { search: null, mine: null };
    this.goodAt = null; // when a search turn last had Jira answer for every key it asked about
    this.missed = false; // the running turn had a search Jira didn't answer
    this.mineGoodAt = null; // when the "my tickets" search last answered
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
  // kit-jira writes only its feed. The feed's badges and rows stay plain, with
  // the searches' last good times beside them; the published ones carry the
  // stale mark once those are over JIRA_STALE_MS old.
  publish(list, now) {
    const { jira_url: site, jira_projects: projects } = this.cfg;
    const values = {
      badges: badges(list, this.tickets, site, projects),
      rows: this.cfg.jira_mine ? rows(this.mine, list, site, projects) : [],
    };
    const out = { feed: feed(this.tickets, agentKeys(list, projects), values.badges, values.rows, now, this.goodAt, this.mineGoodAt) };
    if (this.cfg.jira_publish) {
      out.badges = envelope(staleBadges(values.badges, this.goodAt, now), now);
      out.rows = envelope(staleRows(values.rows, this.mineGoodAt, now), now);
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
  // back to one search per key, so the good keys still badge. A key Jira
  // rejects by name is left out of later batches and asked about alone every
  // BAD_MS (kit.js splitKeys). Any other failure keeps the last tickets it had,
  // and the feed's `good_at` stays at the last turn Jira answered in full, so a
  // reader can tell kept statuses from fresh ones.
  refreshTickets(cx, keys) {
    const sig = keys.join(",");
    const acli = this.acli();
    const { batch, retry, bad } = splitKeys(keys, this.bad, Date.now());
    this.bad = bad;
    this.search.busy = true;
    this.missed = false;
    cx.spawn(async () => {
      let again = false;
      try {
        const got = await this.searchBatch(acli, batch);
        if (got) await this.settle(acli, keys, got, retry);
        if (got && !this.missed) this.goodAt = Date.now();
      } catch (e) {
        this.acliRejected("search", e, acli);
        again = acli !== this.acli();
      } finally {
        this.search.sig = again ? "" : sig; // retry on the minute, not every tick
        this.search.at = Date.now();
        this.search.busy = false;
      }
    });
  }

  // The batch's tickets, or null when Jira answered for none of its keys (logged).
  async searchBatch(acli, batch) {
    if (!batch.length) return {};
    const r = await exec(acli, searchArgs(batch));
    if (r.code === 0) return parseSearch(r.stdout);
    const one = {};
    const got = batch.length > 1 ? await this.searchEach(acli, batch) : this.solo(batch[0], r, one) ? one : null;
    if (got) return got;
    this.noteFailure("search", r.stderr.trim() || `exit ${r.code}`);
    return null;
  }

  // One search per key: their tickets, or null when Jira answered for none.
  async searchEach(acli, keys) {
    const got = {};
    let answered = false;
    for (const k of keys) if (this.solo(k, await exec(acli, searchArgs([k])), got)) answered = true;
    return answered ? got : null;
  }

  // One key's own search into `got`. Jira answered when it found the ticket
  // or rejected the key by name, and only then is the key marked good or bad.
  // Any other failure (an outage, a timeout) keeps the key's last ticket.
  solo(k, r, got) {
    if (r.code === 0) { Object.assign(got, parseSearch(r.stdout)); delete this.bad[k]; return true; }
    if (rejectsKey(r.stderr, k)) { this.bad[k] = Date.now(); return true; }
    if (this.tickets[k]) got[k] = this.tickets[k];
    this.missed = true;
    return false;
  }

  // Ask about each bad key that is due again, then keep the tickets and log
  // the bad keys when they change. A retry Jira didn't answer keeps its old
  // stamp, so it is asked about again next turn.
  async settle(acli, keys, got, retry) {
    for (const k of retry) this.solo(k, await exec(acli, searchArgs([k])), got);
    this.tickets = got;
    const bad = keys.filter((k) => k in this.bad);
    if (bad.length) this.noteFailure("search", `no ticket for ${bad.join(", ")} (set jira_projects to skip names like these)`);
    else this.failed.search = null;
  }

  refreshMine(cx) {
    const acli = this.acli();
    this.mineRun.busy = true;
    cx.spawn(async () => {
      let retry = false;
      let failed = false;
      try {
        const r = await exec(acli, mineArgs(this.cfg.jira_mine_jql));
        if (r.code === 0) { this.mine = parseSearch(r.stdout); this.failed.mine = null; this.mineGoodAt = Date.now(); }
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
