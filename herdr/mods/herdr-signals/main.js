// herdr-signals: herdr-kit's brain. Each poll it resolves every Claude's name,
// renames one-Claude tabs to match, publishes the view model the other kit
// mods draw (setShared("herdr-kit")), keeps one Discord card per stretch away
// from this Mac, mirrors counts to the Stream Deck, and draws the bottom strip
// with the focus/grid switch. Add-on mods (docs/addons.md) publish badges,
// rail rows and strip buttons through shared keys; this reads them each poll
// and draws nothing for them when they publish nothing. It also keeps a
// README tab first in every space whose repo has one (readme.js), so an
// emptied space shows its README.
import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import {
  agents, appHome, exec, focused, home, layout, layouts, nextCommand, closeOverlay, notify, openOverlay, panes, readTextFile, run, setAgentOrder, settings, setShared, shared, spaces, theme, watchFolder, writeTextFile,
} from "herdr";
import { deckApprove } from "./approve.js";
import { deckAsks, deckUsage, summary } from "./policy.js";
import { paceAdd, parseLimits, usageView } from "./usage.js";
import { initialCardState, cardStep, buildCard } from "./card.js";
import { parseHidIdleSeconds } from "./idle.js";
import { initialNamesMemo, resolveNames } from "./names.js";
import { attentionStep, autoSpotlight, awayStep, awayToast, buildModel, readRunState, urgencyOrder, urgentHit } from "./model.js";
import { DIGEST_MS, focusDigest, focusExpired, focusHolds, focusLabel, focusOn, focusToggle, heldLabel } from "./focus.js";
import { pruneSnooze, snoozeActive } from "./snooze.js";
import { prunePins } from "./pins.js";
import { blockedLabel, digestLine, focusButton, stripCounts, usageItem } from "./strip.js";
import { applyReads, changedFiles, parseStamps, pruneCtxArgs, stampDiff } from "./folder.js";
import { LAYOUT_NOTE, layoutChanged } from "./layout.js";
import { APPLY_PROBLEM, applyOutcome, validLook } from "./dress.js";
import { readClicks } from "./clicks.js";
import { readSizes, replaySizes, seedAside, sizesRecord, sizesText } from "./sizes.js";
import { readConfig } from "./config.js";
import { KIT_LAYOUT, SCENES, isGridTree, sceneList, sceneOfTree } from "./scenes.js";
import { SCENES_DIALOG, buttonTexts, leftPx, leftTexts, signalsWidth, stripFit, usagePx } from "./strip-fit.js";
import { NO_KIT_PROBLEM, SWITCH_PROBLEM, afterStep, findNode, pickFollow, pinFor, pinOf, readTree, recordTheme, stepPlan, switchStep, toggleWant, wantStep } from "./view.js";
import { README_MOD, README_TAB, pickReadme, readmeMoves, readmeNeeds } from "./readme.js";
import { gridAddresses, gridLanding, gridLeave, gridSignature, gridSpec, isLight, spotKey, spotNext } from "./grid.js";
import { PR_FIELDS, parsePr, parsePrBatch, prMark, prQuery, prRef, repoOf } from "./prs.js";
import { ADDON_KEYS, cardName, deckBadge, pressCommand, readAddon, withBadges } from "./addons.js";

const DEFAULTS = {
  discord_webhook: "",
  done_min_seconds: 180,
  away_seconds: 120,
  grace_seconds: 60,
  poll_ms: 2000,
  deck_port: 47651,
  gh: "/opt/homebrew/bin/gh",
  auto_spotlight: false,
  away_toast: true,
  // The extras are opt-in: each is a switch, off until the config turns it on.
  deck: false,
  readme_tabs: false,
  usage_meter: false,
  run_cards: false,
  pr_status: false,
  run_log_pipe: "",
  focus_max_minutes: 120,
  addons: [],
};
const README_TTL_MS = 60000;
const DECK_HEARTBEAT_MS = 30000;
const AUTO_SPOTLIGHT_IDLE_S = 5;

const NAMES_RELOAD_POLLS = 15; // safety net if a folder event is missed
const PR_REFRESH_POLLS = 30; // ~60 s at the default poll; PR state moves slowly

/** Agents plus their tab's `named` flag (agents() doesn't carry it). */
// The appearance itself (light or dark mode), which a pinned theme pair hides from theme().
function realLight() {
  try {
    const dark = settings()?.dark;
    if (typeof dark === "boolean") return !dark;
  } catch { /* fall back */ }
  return isLight(theme().background);
}

function rawAgents() {
  const named = {};
  for (const sp of spaces()) for (const t of sp.tabs) named[t.id] = t.named;
  const pane = {};
  for (const p of panes()) pane[p.pane] = p;
  return agents().map((a) => ({
    address: a.address,
    status: a.status,
    focused: a.focused,
    tab: a.tab,
    tab_name: a.tab_name,
    tab_named: named[a.tab] ?? false,
    space: a.space,
    space_name: a.space_name,
    branch: pane[a.pane]?.branch ?? null,
    cwd: pane[a.pane]?.cwd ?? null,
    seq: a.seq,
  }));
}

const RUNSTATE_PRUNE_MS = 3_600_000;
const LAYOUT_CHECK_MS = 3_600_000; // Herdr updates are rare; an hour late is fine
const RUNSTATE_KEEP_MIN = 7 * 24 * 60;

export default class Signals extends View {
  init(_props, cx) {
    // Add-on data published before this start is a past session's (addons.js readAddon).
    this.started = Date.now();
    // The scene picker (kit-scenes) can't import SCENES, so it reads them from here, once.
    setShared("kit.scenes", sceneList(SCENES));
    this.cfg = null;
    this.problem = null;
    this.state = initialCardState();
    this.namesMemo = initialNamesMemo();
    this.files = {};
    this.layoutNote = null; // LAYOUT_NOTE while kit.json is older than Herdr's main.json
    this.namesStamps = {}; // names file -> "mtime size" at its last read (folder.js)
    this.attention = {};
    this.lastModel = "";
    this.gridSig = null;
    // The one kit layout (view.js): apply() is its only writer, one pass at a time.
    this.applying = false;
    this.again = false; // a request came in while a pass ran: run one more
    this.clicksAside = { focus: {}, grid: {} }; // each shape's clicks the other shape lacks, and its rail
    this.focusTree = null; // ~/.config/herdr-kit/layout-focus.json, the undressed focus shape
    this.sizesPath = `${home()}/.config/herdr-kit/sizes.json`; // each view's sizes (sizes.js), for reloads and make-layout
    this.sizes = { focus: {}, grid: {} };
    this.sizesSaved = null; // the text last written (or read), so an unchanged record isn't rewritten
    this.sizesNext = null; // a record waiting while one write runs
    this.sizesWriting = false;
    this.sizesPending = []; // view writes made before sizes.json loaded, replayed over it (sizes.js replaySizes)
    this.sizesLoaded = false;
    this.focusSource = undefined; // layout-source.json's text when focusTree was read
    this.mainNode = null; // Herdr's main.json `main` node: the fallback focus `main`
    this.focusFallback = false; // focus was rebuilt without layout-focus.json
    this.polls = 0;
    this.prs = {};
    this.prSig = "";
    this.prBusy = false;
    this.repos = {}; // folder -> {owner, name} from its origin, or null (prs.js repoOf)
    this.namesDir = `${home()}/.config/herdr-kit/names`;
    this.ctxDir = `${home()}/.config/herdr-kit/ctx`; // written by the Claude status line
    this.ctx = {};
    this.limitsPath = `${home()}/.cache/herdr-chat/claude-limits.json`; // written by the Claude status line
    this.pace = null; // the 5h window's readings (usage.js paceAdd)
    this.usage = null; // usageView for the strip and the deck
    this.usageSig = "";
    this.runDir = `${home()}/.config/herdr-kit/runstate`;
    this.runstate = {};
    this.pinsMissing = {}; // address -> first poll its pinned Claude was gone (pins.js)
    this.autoHandled = {};
    this.readmeCache = {}; // folder -> {at, busy, value: README path | null}
    this.readmePending = {}; // space id -> when a README tab was asked for
    this.readmeMoved = {}; // README tab id -> when it was moved first
    this.awayTrack = null;
    this.lastDeck = { body: "", at: 0 };
    this.failing = { discord: false, deck: false };
    cx.spawn(async (cx) => {
      await this.loadConfig();
      cx.notify();
      await this.checkLayout();
      await this.loadSizes();
      await exec("mkdir", ["-p", this.namesDir]).catch(() => null);
      await this.reloadNames();
      if (this.cfg.run_cards) {
        await exec("mkdir", ["-p", this.runDir]).catch(() => null);
        await this.pruneRunState();
        await this.reloadRunState();
      }
      cx.timer.every(this.cfg.poll_ms, (cx) => this.poll(cx));
      cx.timer.every(RUNSTATE_PRUNE_MS, (cx) => cx.spawn(async () => {
        await this.pruneRunState();
        await this.pruneCtx();
      }));
      cx.timer.every(LAYOUT_CHECK_MS, (cx) => cx.spawn(async (cx) => { await this.checkLayout(); cx.notify(); }));
      if (this.cfg.run_cards) {
        cx.spawn(async (cx) => {
          for (;;) {
            await watchFolder(this.runDir);
            await this.reloadRunState();
          }
        });
      }
      cx.spawn(async (cx) => {
        for (;;) {
          const paths = await watchFolder(this.namesDir);
          await this.reloadNames(changedFiles(paths, this.namesDir));
        }
      });
      cx.spawn(async (cx) => {
        for (;;) {
          const c = await nextCommand();
          try {
            this.command(c, cx);
          } catch (e) {
            console.log(`herdr-signals: command ${c} failed (${e})`);
          }
          cx.notify();
        }
      });
    });
  }

  // runstate/<terminal>-<run id>.json, written by the ▶ Run script (kit look.js runArgv).
  async reloadRunState() {
    if (!this.cfg.run_cards) return;
    const states = {};
    try {
      const r = await exec("ls", ["-1", this.runDir]);
      for (const f of r.stdout.split("\n")) {
        const m = f.match(/^([A-Za-z0-9_-]+-[a-z0-9]{1,16})\.json$/);
        if (!m) continue;
        try {
          const st = readRunState(JSON.parse((await readTextFile(`${this.runDir}/${f}`)) ?? "null"));
          if (st) states[m[1]] = st;
        } catch {
          // half-written or junk: skip until the next write
        }
      }
    } catch {
      return;
    }
    this.runstate = states;
  }

  // A run's result shows while its card is listed, so keep it as long as the
  // names file that lists the card (a week). It was 6 h: on 2026-11-09 a merge
  // card that ran at 11:38 showed ▶ Run again by 20:00, as if it never ran.
  async pruneRunState() {
    if (!this.cfg.run_cards) return;
    await exec("find", [this.runDir, "-name", "*.json", "-mmin", `+${RUNSTATE_KEEP_MIN}`, "-delete"]).catch(() => null);
  }

  // One scene picker at a time: a second press replaces the first.
  openScenes() {
    if (this.scenesOverlay) {
      try { closeOverlay(this.scenesOverlay); } catch { /* already closed */ }
      this.scenesOverlay = null;
    }
    const msg = "scene picker: restart Herdr to load kit-scenes";
    try {
      this.scenesOverlay = openOverlay({ mod: "kit-scenes", kind: "dialog", width: SCENES_DIALOG.width, height: SCENES_DIALOG.height });
      if (this.problem === msg) this.problem = null;
    } catch (e) {
      console.log(`herdr-signals: scene picker failed to open (${e})`);
      this.problem = msg;
    }
  }

  // Tells add-ons a button of theirs was pressed: they watch kit.addon.press.
  press(id) {
    setShared(ADDON_KEYS.press, { id, at: Date.now() });
  }

  // What add-ons published, checked (addons.js). Only while the config lists
  // add-ons, and only what they stamped since this start: shared state
  // outlives a restart and a removed add-on, and terminal addresses are reused.
  addonData(only = null) {
    if (!Array.isArray(this.cfg?.addons) || !this.cfg.addons.length) return readAddon(null);
    const keys = only ? [only] : ["badges", "rows", "buttons"];
    return readAddon(Object.fromEntries(keys.map((k) => [k, shared(ADDON_KEYS[k])])), this.started);
  }

  // Key commands from keys.json ("herdr-signals.<command>").
  command(c, cx = null) {
    // An add-on strip button or key (keys.json "herdr-signals.press-<id>"): Herdr
    // passes a mod command only as a string, so the id rides in the name.
    const press = pressCommand(c);
    if (press) { this.press(press); return; }
    if (c === "focus") { this.toggleFocus(Date.now()); return; }
    // The view is a request apply() writes onto the kit layout; off it, a view request is dropped.
    if (c === "view-toggle") {
      const v = toggleWant(shared("kit.view") ?? null, shared("kit.viewWant") ?? null);
      if (v) { setShared("kit.viewWant", v); this.kick(cx); }
      return;
    }
    if (c === "view-focus" || c === "view-grid") { setShared("kit.viewWant", c.slice(5)); this.kick(cx); return; }
    if (c === "scenes") { this.openScenes(); return; }
    // Outside the grid the spotlight keys are the space keys they shadow, even before the first poll.
    const key = spotKey(c, shared("kit.view") ?? null);
    if (key?.run) { run(key.run); return; }
    const m = this.model;
    if (!m) return;
    const grid = shared("kit.view") === "grid";
    const all = !!shared("kit.gridAll");
    if (key) {
      const list = gridAddresses(m.agents, m.current_space, all);
      const to = spotNext(list, shared("kit.spotlight") ?? null, key.spot);
      if (to) { setShared("kit.spotlight", to); this.kick(cx); }
    } else if (c === "urgent") {
      const hit = urgentHit(m.agents);
      if (!hit) return;
      if (grid) { setShared("kit.spotlight", hit.address); this.kick(cx); } else run("agent.focus", { terminal: hit.address });
    } else if (c === "next-ask") {
      // Each press moves on: the first Claude with an open card that isn't focused.
      const to = deckAsks(m.agents, focused()?.terminal ?? null).next;
      if (!to) return;
      if (grid) { setShared("kit.spotlight", to); this.kick(cx); } else run("agent.focus", { terminal: to });
    } else if (c === "grid-all") {
      // Bound in both views (layout:scruffy); outside the grid it does nothing.
      if (!grid) return;
      setShared("kit.gridAll", !all);
      this.gridSig = null;
      this.kick(cx);
    }
  }

  // Focus mode (focus.js): on is `kit.focus = {since}`; off shows one digest of what finished.
  toggleFocus(now) {
    if (focusOn(shared("kit.focus"))) this.endFocus(now);
    else setShared("kit.focus", focusToggle(null, now));
  }

  endFocus(now) {
    const f = shared("kit.focus");
    setShared("kit.focus", null);
    const d = focusDigest(f, this.model?.agents, now);
    if (!d) return;
    notify({ title: "Focus ended", body: d.text, level: "info", action: { name: "agent.focus", args: { terminal: d.first } } });
    this.digest = { count: d.count, minutes: d.minutes, first: d.first, until: now + DIGEST_MS };
  }

  // The digest line's click: the first Claude that finished while you focused.
  goDigest(cx = null) {
    const to = this.digest?.first;
    this.digest = null;
    if (!to) return;
    if (shared("kit.view") === "grid") { setShared("kit.spotlight", to); this.kick(cx); } else run("agent.focus", { terminal: to });
  }

  // names/<terminal>.json, written by claude/name-hook.mjs. `only` is the
  // files a watch event named; without it, the files whose mtime or size moved
  // (folder.js), so a hook write no longer rereads every names file.
  async reloadNames(only = null) {
    let read = only;
    let stamps = null;
    if (!read) {
      try {
        const r = await exec("find", [this.namesDir, "-maxdepth", "1", "-name", "*.json", "-exec", "stat", "-f", "%Fm %z %N", "{}", "+"]);
        if (r.code !== 0) return; // a listing that failed would read as "every file gone"
        stamps = parseStamps(r.stdout);
      } catch {
        return;
      }
      const diff = stampDiff(this.namesStamps, stamps);
      read = diff.read;
      this.files = applyReads(this.files, diff.gone.map((f) => [f, null]));
    }
    const results = await Promise.all(read.map(async (f) => {
      try {
        const text = await readTextFile(`${this.namesDir}/${f}`);
        return [f, text === null ? null : JSON.parse(text)];
      } catch {
        return [f, undefined]; // half-written or junk: keep the last good copy
      }
    }));
    this.files = applyReads(this.files, results);
    if (stamps) this.namesStamps = stamps;
    else for (const f of read) delete this.namesStamps[f]; // the next safety net rereads it once
  }

  // sizes.json from the last run: seeds the clicks held aside, so a reload keeps the other view's sizes.
  async loadSizes() {
    const text = await readTextFile(this.sizesPath).catch(() => null);
    this.sizesSaved = text;
    this.clicksAside = seedAside(this.clicksAside, readSizes(text));
    // Writes that ran first are laid over what was on disk, then written once.
    const pending = this.sizesPending.splice(0);
    this.sizes = replaySizes(readSizes(text), pending);
    this.sizesLoaded = true;
    if (pending.length) await this.writeSizes();
  }

  // After a view is written: record its sizes (and the other view's held aside). One writer at a
  // time, only when the text changed; writeTextFile replaces only what it read. A failure is logged, never thrown.
  async saveSizes(tree, view) {
    if (!this.sizesLoaded) {
      // Before the load, a write would drop the other view's saved sizes: hold it for loadSizes.
      this.sizesPending.push({ view, tree: JSON.parse(JSON.stringify(tree)), aside: JSON.parse(JSON.stringify(this.clicksAside)) });
      return;
    }
    this.sizes = sizesRecord(this.sizes, view, tree, this.clicksAside);
    await this.writeSizes();
  }

  async writeSizes() {
    this.sizesNext = sizesText(this.sizes);
    if (this.sizesWriting) return;
    this.sizesWriting = true;
    try {
      while (this.sizesNext !== null) {
        const text = this.sizesNext;
        this.sizesNext = null;
        if (text === this.sizesSaved) continue;
        try {
          const prev = await readTextFile(this.sizesPath).catch(() => null);
          await writeTextFile(this.sizesPath, text, prev);
          this.sizesSaved = text;
        } catch (e) {
          console.log(`herdr-signals: sizes not saved: ${e}`);
        }
      }
    } finally {
      this.sizesWriting = false;
    }
  }

  // The kit layout is built from Herdr's main.json by install.sh; say so when main.json moved on.
  // Also (re)reads the focus shape when layout-source.json changed (a reinstall), and
  // keeps main.json's `main` node for a focus rebuilt without it (view.js viewTree).
  async checkLayout() {
    const dir = `${home()}/.config/herdr-kit`;
    const main = `${appHome()}/layouts/main.json`;
    const [a, b] = await Promise.all([readTextFile(main).catch(() => null), readTextFile(`${dir}/layout-source.json`).catch(() => null)]);
    this.layoutNote = layoutChanged(a, b) ? LAYOUT_NOTE : null;
    this.mainNode = findNode(readTree(a), "main");
    if (b !== this.focusSource || !this.focusTree) {
      this.focusSource = b;
      this.focusTree = readTree(await readTextFile(`${dir}/layout-focus.json`).catch(() => null));
      if (this.focusTree) this.focusFallback = false;
    }
  }

  // ctx/<terminal>: context remaining, whole percent. Missing or junk: unknown.
  async reloadCtx() {
    const ctx = {};
    try {
      const r = await exec("ls", ["-1", this.ctxDir]);
      if (r.code !== 0) return; // no folder yet: no Claude has drawn a status line inside Herdr
      const files = r.stdout.split("\n").filter((f) => /^[A-Za-z0-9_-]+$/.test(f));
      // One small file per terminal: read them side by side, not one after another.
      const texts = await Promise.all(files.map((f) => readTextFile(`${this.ctxDir}/${f}`).catch(() => null)));
      files.forEach((f, i) => {
        const n = Number.parseInt(texts[i] ?? "", 10);
        if (Number.isFinite(n)) ctx[f] = n;
      });
    } catch {
      return; // no folder yet: no Claude has drawn a status line inside Herdr
    }
    this.ctx = ctx;
  }

  // ctx-tap writes a terminal's file only when its number changes, and nothing
  // else deletes it, so closed terminals' files pile up (44 on the first day).
  // A week untouched matches names/ and runstate/; a live Claude's next status
  // line redraw writes its file again.
  async pruneCtx() {
    await exec("find", pruneCtxArgs(this.ctxDir)).catch(() => null);
  }

  // Usage limits: a missing or malformed file means no meter, never an error.
  async reloadUsage(now) {
    if (!this.cfg.usage_meter) return;
    let limits = null;
    try { limits = parseLimits(await readTextFile(this.limitsPath)); } catch { limits = null; }
    if (limits?.five) this.pace = paceAdd(this.pace, limits.five, limits.at * 1000);
    else this.pace = null;
    this.usage = usageView(limits, this.pace, now);
  }

  async loadConfig() {
    const path = `${home()}/.config/herdr-kit/config.json`;
    const text = await readTextFile(path).catch(() => null);
    const { cfg, problem } = readConfig(text, DEFAULTS);
    this.cfg = cfg;
    if (problem) this.problem = problem;
    // One check of config `look`: a bad value falls back to its default and says so on the strip.
    const v = validLook(this.cfg.look);
    this.look = v.look;
    this.lookProblem = v.problems[0] ?? null;
    const pipe = typeof this.cfg.run_log_pipe === "string" ? this.cfg.run_log_pipe.trim() : "";
    if ((shared("kit.runLogPipe") ?? "") !== pipe) setShared("kit.runLogPipe", pipe);
  }

  // An apply pass soon, from a handler or a render: the request shouldn't wait for the poll.
  // `cx` is the caller's own (a handler's, a timer's); without one the pass runs as a plain promise
  // and the shared keys it sets redraw the strip.
  kick(cx = null) {
    if (!this.cfg) return;
    if (cx) cx.spawn(async (cx) => { await this.apply(); cx.notify(); });
    else this.apply().catch((e) => console.log(`herdr-signals: apply failed (${e})`));
  }

  /**
   * The kit layout's one writer. The poll, key commands and render-time
   * requests all come here; one pass runs at a time, and a request that comes
   * in during a pass gets one more pass, so no two writes ever interleave.
   */
  async apply() {
    if (!this.cfg) return;
    if (this.applying) { this.again = true; return; }
    this.applying = true;
    try {
      for (let i = 0; i < 4; i++) {
        this.again = false;
        await this.applyStep();
        if (!this.again) break;
      }
    } catch (e) {
      console.log(`herdr-signals: apply failed (${e})`);
    } finally {
      this.applying = false;
    }
  }

  /**
   * One pass: apply the latest kit.sceneWant / kit.viewWant (view.js
   * wantStep), else keep the shown tree dressed as its scene for this
   * appearance and the grid tiled; then publish kit.scene and kit.view.
   * Herdr deletes layouts/.state/<layout>.json on every layout.set, so the
   * user's clicks are read first and dressed into the tree. After a failure it
   * stays quiet until the layout, appearance, scene, view or tiling changes.
   */
  async applyStep() {
    const name = shared("layout");
    const onKit = name === KIT_LAYOUT;
    const text = onKit ? await readTextFile(`${appHome()}/layouts/.state/${name}.json`).catch(() => null) : null;
    // Once per run: the layout file itself, since layout() has a theme-list pick merged in.
    const fileText = onKit && !this.writtenTheme ? await readTextFile(`${appHome()}/layouts/${name}.json`).catch(() => null) : null;
    // The layout switched while we read: these clicks belong to the old one. Try again.
    if (shared("layout") !== name) { this.again = true; return; }
    // From here to the end nothing awaits, so the tree read is the tree written over.
    const shown = layout();
    this.stripPx = signalsWidth(shown); // the strip block's own width, for strip-fit
    const has = onKit && shown !== null && typeof shown === "object";
    const sceneWant = shared("kit.sceneWant") ?? null;
    const viewWant = shared("kit.viewWant") ?? null;
    const clicks = readClicks(text);
    // layout() merges a pick from .state into its tree, so the file's own theme is what we last wrote (or the file read).
    const fileTheme = has ? recordTheme({ written: this.writtenTheme, fileText, shown, stateTheme: clicks.theme }) : null;
    if (fileTheme) this.writtenTheme = fileTheme;
    const cur = { scene: has ? sceneOfTree({ theme: fileTheme }) : null, view: has ? (isGridTree(shown) ? "grid" : "focus") : null };
    const want = wantStep({ shown: name, ...cur, sceneWant, viewWant, stateTheme: clicks.theme, fileTheme });
    this.follow = want.follow; // the theme-list follow runs only when no request is pending
    if (want.follow) {
      // A scene's theme picked in Herdr's list: ask for that scene; the write clears the pick. Any other pick is kept (stepPlan).
      const pick = pickFollow(fileTheme, clicks.theme, realLight());
      if (pick && pick !== "keep") { setShared("kit.sceneWant", pick); this.again = true; return; }
    }
    if (want.switchTo) {
      // Off the kit layout, a scene request switches to it in focus, once; the next pass writes the scene.
      const step = switchStep({ present: layouts().includes(want.switchTo), tried: this.switchTried ?? null, want: sceneWant, now: Date.now() });
      if (step === "switch") {
        this.switchTried = { want: sceneWant, at: Date.now() };
        run("layout.switch", { name: want.switchTo });
        setShared("kit.viewWant", want.view);
        return;
      }
      if (step === "wait") return;
      // No kit layout to switch to, or the switch never landed: drop the request and say so.
      this.switchTried = null;
      this.problem = step === "missing" ? NO_KIT_PROBLEM : SWITCH_PROBLEM;
      console.log(this.problem);
      setShared("kit.sceneWant", null);
      if (viewWant !== null) setShared("kit.viewWant", null);
      return;
    }
    if (!has) {
      if (sceneWant !== null) setShared("kit.sceneWant", null);
      if (viewWant !== null) setShared("kit.viewWant", null);
      this.leaveGrid();
      this.runAfter(null);
      this.publish(null, null);
      return;
    }
    this.switchTried = null;
    if (this.problem === NO_KIT_PROBLEM || this.problem === SWITCH_PROBLEM) this.problem = null;
    // A pinned look (both halves one theme) overrides the appearance for the picture and the grid.
    const pin = pinFor({ look: want.look, light: realLight(), fileTheme });
    const light = pin ? pin === "day" : realLight();
    let plan = null;
    if (want.view === "grid") {
      plan = this.gridPlan(want.scene, light);
      if (!plan) return; // no model before the first poll: keep the request
      if (plan.leave) { setShared("kit.viewWant", "focus"); this.again = true; return; }
    }
    const p = stepPlan({
      shown, cur, want, plan, clicks: clicks.nodes, focus: this.focusTree, main: this.mainNode, aside: this.clicksAside,
      gridSig: this.gridSig, look: this.look, light, name, failedKey: this.applyFailed ?? null, stateTheme: clicks.theme, sceneWant, fileTheme, pin,
    });
    let shownNow = shown;
    let retiled = false;
    if (!p.skip) {
      let error = p.error;
      if (!error) {
        try {
          if (p.write) run("layout.set", { layout: p.write });
          if (p.aside) this.clicksAside = p.aside;
          if (p.write) this.saveSizes(p.write, isGridTree(p.write) ? "grid" : "focus").catch(() => null);
          if (p.fallback) this.focusFallback = true;
          shownNow = p.next;
          if (p.write) this.writtenTheme = p.next.theme;
          retiled = p.retiled;
        } catch (e) {
          error = e;
        }
      }
      const out = applyOutcome(p.key, error);
      this.applyFailed = out.failedKey;
      if (out.problem) {
        this.problem = out.problem;
        console.log(out.problem);
      } else if (this.problem?.startsWith(APPLY_PROBLEM)) this.problem = null;
    }
    // Handled, or skipped as the key that just failed: either way the request is spent.
    if (sceneWant !== null) setShared("kit.sceneWant", null);
    if (viewWant !== null) setShared("kit.viewWant", null);
    const nowView = isGridTree(shownNow) ? "grid" : "focus";
    if (nowView === "grid") { if (plan) this.gridDone(plan, retiled); } else this.leaveGrid();
    this.runAfter(nowView);
    this.publish(sceneOfTree({ theme: this.writtenTheme ?? shownNow.theme }), nowView);
  }

  /** kit.scene and kit.view for the drawing mods, set only when they change. */
  publish(scene, view) {
    if ((shared("kit.scene") ?? null) !== scene) setShared("kit.scene", scene);
    if ((shared("kit.view") ?? null) !== view) setShared("kit.view", view);
  }

  /** kit.afterView ({view, address, argv?}): once `view` is shown, focus that Claude and maybe split under it. */
  runAfter(view) {
    const after = shared("kit.afterView") ?? null;
    const step = afterStep(after, view, (shared("kit.viewWant") ?? null) !== null);
    if (!step || step === "wait") return;
    setShared("kit.afterView", null);
    if (step !== "run") return;
    run("agent.focus", { terminal: after.address });
    if (Array.isArray(after.argv)) {
      const p = panes().find((x) => x.terminal === after.address);
      if (p) run("pane.split", { direction: "down", pane: p.pane, argv: after.argv });
    }
  }

  // Out of the grid: forget its tiling and spotlight, so coming back re-sorts.
  leaveGrid() {
    this.gridSig = null; this.gridOrder = []; this.gridSeen = null; this.spotApplied = null;
    if (shared("kit.spotlight")) setShared("kit.spotlight", null);
    if (shared("kit.grid")) setShared("kit.grid", null);
  }

  /**
   * The grid's tiling for this pass: {spec, sig, land, req}, {leave: true}
   * when the grid should hand back to focus, or null before the first poll.
   * Placed tiles keep their places; a re-tile happens when the tiles, their
   * attention, the column count, the chip strip, the scene or the appearance change.
   */
  gridPlan(scene, light) {
    const model = this.model;
    if (!model) return null;
    // kit-pane and kit-rail ask for a spotlight through shared "kit.spotlight".
    let want = shared("kit.spotlight") ?? null;
    const all = !!shared("kit.gridAll");
    let spec = gridSpec(model.agents, model.current_space, this.gridOrder ?? [], want, all);
    // A focus-view rail click asks to land on one Claude (shared "kit.gridFocus").
    const req = shared("kit.gridFocus") ?? null;
    // A new request means a fresh entry into the grid. Leaving by the strip
    // button or the view key only resets this state on the next pass, and a stale
    // gridSeen would see the clicked terminal as "moved off the tiles" and leave.
    if (req && this.landingFor !== req.at) {
      this.landingFor = req.at;
      this.gridSeen = null; this.gridSig = null; this.gridOrder = [];
      if (want) { want = null; setShared("kit.spotlight", null); }
      spec = gridSpec(model.agents, model.current_space, [], want, all);
    }
    const land = req ? gridLanding(req, model.agents, model.current_space, all, spec.tiles.map((a) => a.address), Date.now()) : null;
    if (land && land !== "wait") setShared("kit.gridFocus", null);
    if (land === "spotlight") {
      want = req.address;
      setShared("kit.spotlight", want);
      spec = gridSpec(model.agents, model.current_space, this.gridOrder ?? [], want, all);
    }
    if (want && !spec.spotlight) setShared("kit.spotlight", null);
    const f = focused();
    const space = spaces().find((s) => s.id === model.current_space);
    const step = gridLeave(this.gridSeen, {
      space: model.current_space,
      tabs: (all ? spaces().flatMap((s) => s.tabs) : space?.tabs ?? []).map((t) => t.id),
      terminal: f?.terminal ?? null,
      tiles: spec.tiles.map((a) => a.address),
      all,
    });
    this.gridSeen = step.state;
    if (step.leave) {
      this.gridSig = null; this.gridOrder = []; this.gridSeen = null;
      return { leave: true };
    }
    // Tile borders take the scene's light or dark tone; a theme or scene switch re-lays the grid.
    spec.light = light;
    spec.scene = scene;
    return { spec, sig: gridSignature(spec), land, req };
  }

  // After a pass in the grid: record a re-tile, and focus what it was for.
  gridDone(plan, retiled) {
    const { spec, land, req } = plan;
    if (retiled) {
      this.gridSig = plan.sig;
      // The even grid's order survives a spotlight, so leaving it restores places.
      if (!spec.spotlight) this.gridOrder = spec.tiles.map((a) => a.address);
      setShared("kit.grid", { space: this.model.current_space, spotlight: spec.spotlight, tiles: spec.tiles.map((a) => a.address) });
      // After layout.set: a rebuilt layout can move the cursor.
      if (spec.spotlight && spec.spotlight !== this.spotApplied) run("agent.focus", { terminal: spec.spotlight });
      this.spotApplied = spec.spotlight;
    }
    if (land === "focus") run("agent.focus", { terminal: req.address });
  }

  // The README a folder's repo has (git root, else the folder itself), cached.
  readmeFor(folder, now) {
    const c = this.readmeCache[folder];
    if ((!c || now - c.at >= README_TTL_MS) && !(c && c.busy)) {
      this.readmeCache[folder] = { at: c ? c.at : 0, busy: true, value: c ? c.value : null };
      (async () => {
        const g = await exec("git", ["-C", folder, "rev-parse", "--show-toplevel"]);
        const root = g.code === 0 && g.stdout.trim() ? g.stdout.trim() : folder;
        const r = await exec("ls", ["-1", root]);
        const name = r.code === 0 ? pickReadme(r.stdout.split("\n").filter(Boolean)) : null;
        return name ? `${root}/${name}` : null;
      })().then((v) => { this.readmeCache[folder] = { at: Date.now(), busy: false, value: v }; },
        () => { this.readmeCache[folder] = { at: Date.now(), busy: false, value: null }; });
    }
    return this.readmeCache[folder]?.value ?? null;
  }

  // Add a README tab to each space that needs one, and move any README tab
  // that isn't first back to the front (tab.move doesn't change what's shown).
  // tab.new shows the new tab, so put back the space's tab and the shown space.
  syncReadmeTabs(now) {
    const shown = focused()?.space ?? null;
    for (const { tab } of readmeMoves(spaces(), panes(), this.readmeMoved, now)) {
      this.readmeMoved[tab] = now;
      run("tab.move", { id: tab, index: 1 });
    }
    for (const { space, folder } of readmeNeeds(spaces(), panes(), this.readmePending, now)) {
      const file = this.readmeFor(folder, now);
      if (!file) continue;
      this.readmePending[space.id] = now;
      const wasActive = space.tabs.find((t) => t.active)?.id ?? null;
      run("tab.new", { space: space.id, name: README_TAB, mod: README_MOD, props: { file } });
      if (wasActive) run("tab.select", { id: wasActive });
      if (shown && shown !== space.id) run("space.select", { id: shown });
    }
  }

  poll(cx) {
    cx.spawn(async (cx) => {
      if (++this.polls % NAMES_RELOAD_POLLS === 0) await Promise.all([this.reloadNames(), this.reloadCtx(), this.reloadRunState()]);
      const raw = rawAgents();
      const now = Date.now();

      const resolved = resolveNames(this.namesMemo, { agents: raw, files: this.files, now });
      this.namesMemo = resolved.memo;
      for (const r of resolved.renames) run("tab.rename", { id: r.tab, name: r.name });

      const prWanted = this.prWanted(raw, resolved.names);
      this.refreshPrs(cx, prWanted);
      const addon = this.addonData();
      const names = Object.fromEntries(Object.entries(withBadges(this.withPrs(resolved.names, prWanted), addon.badges))
        .map(([addr, n]) => [addr, { ...n, ctx_left: this.ctx[addr] ?? null, session: this.files[addr]?.session_id ?? null }])
        .map(([addr, n]) => [addr, this.cfg.run_cards ? n : { ...n, runs: [], card: n.card === "run" ? null : n.card }]));

      // Pins on Claudes gone for PIN_GRACE_MS are dropped, so kit.pins doesn't grow forever.
      const pinned = prunePins(shared("kit.pins"), raw.map((a) => a.address), this.pinsMissing, now);
      this.pinsMissing = pinned.missing;
      if (pinned.changed) setShared("kit.pins", pinned.pins);
      const pins = pinned.pins;

      this.attention = attentionStep(this.attention, raw, now);
      // Snooze quiets what herdr-kit draws and sends (pulse, strip, rail, deck). Herdr's own
      // toast and sound for a blocked or finished Claude can't be muted per Claude.
      // Pruned after attentionStep: a till-done snooze wakes on a fresh done or question.
      const pruned = pruneSnooze(shared("kit.snooze"), this.attention, now);
      const snooze = pruned.snooze;
      if (pruned.changed) setShared("kit.snooze", snooze);
      const model = {
        ...buildModel(raw, names, this.attention, focused()?.space ?? null, snooze, now, pins, {}, this.runstate, shared("kit.focus")),
        // Add-on rows for work no Claude is on, drawn under the rail's Claudes.
        rows: addon.rows,
      };
      const json = JSON.stringify(model);
      if (json !== this.lastModel) {
        this.lastModel = json;
        setShared("herdr-kit", model);
        setAgentOrder(urgencyOrder(model));
      }
      // Focus runs out on its own, so a forgotten toggle can't hide finished Claudes for good.
      if (focusExpired(shared("kit.focus"), now, this.cfg.focus_max_minutes)) { this.endFocus(now); cx.notify(); }
      if (this.digest && now >= this.digest.until) { this.digest = null; cx.notify(); }
      // The kit layout: requests first, then the scene's dress and the grid's tiles (apply).
      this.model = model;
      await this.apply();
      // The strip's "· 14m" ages without the model changing, so redraw when its text does.
      const label = blockedLabel(summary(model.agents), now) + focusLabel(shared("kit.focus"), now);
      if (label !== this.stripLabel) { this.stripLabel = label; cx.notify(); }
      await this.reloadUsage(now);
      const usageSig = JSON.stringify(this.usage);
      if (usageSig !== this.usageSig) { this.usageSig = usageSig; cx.notify(); }
      if (this.cfg.readme_tabs) this.syncReadmeTabs(now);

      const snap = raw.map((a) => ({
        address: a.address, status: a.status, focused: a.focused, name: cardName(names[a.address]), snoozed: snoozeActive(snooze[a.address], now) || focusHolds(shared("kit.focus"), a.status),
        // What a blocked Claude needs, for the Discord card (same as the rail).
        ask: a.status === "blocked" ? (resolved.names[a.address].ask ?? null) : null,
        card: a.status === "blocked" ? (resolved.names[a.address].card ?? null) : null,
      }));
      // ioreg only when an answer could change what Discord, the toast or the spotlight does.
      const relevant = this.state.episode || snap.some((a) => a.status !== "idle");
      const grid = shared("kit.view") === "grid";
      const wantAuto = this.cfg.auto_spotlight === true && grid;
      const wantToast = this.cfg.away_toast !== false && (relevant || this.awayTrack?.away);
      const idle = relevant || wantAuto || wantToast ? await this.idleSeconds() : null;
      const away = relevant ? idle === null || idle >= this.cfg.away_seconds : false;

      if (this.cfg.away_toast !== false) {
        const gone = idle !== null && idle >= this.cfg.away_seconds;
        const st = awayStep(this.awayTrack, snap, gone);
        this.awayTrack = st.track;
        const toast = awayToast(st.report);
        if (toast) notify({ ...toast, level: "info" });
      }

      const auto = autoSpotlight(this.autoHandled, model.agents, {
        enabled: this.cfg.auto_spotlight === true, grid, idle, minIdle: AUTO_SPOTLIGHT_IDLE_S,
      });
      this.autoHandled = auto.handled;
      if (auto.pick && shared("kit.spotlight") !== auto.pick) {
        setShared("kit.spotlight", auto.pick);
        await this.apply();
      }
      const out = cardStep(this.state, snap, now, {
        away,
        graceSeconds: this.cfg.grace_seconds,
        doneMinSeconds: this.cfg.done_min_seconds,
      });
      this.state = out.state;
      if (out.action) await this.sendCard(out.action);
      const here = raw.find((a) => a.focused);
      // The focused Claude's add-on badge, for the deck's badge key.
      const bd = here ? names[here.address]?.badge : null;
      // Rail order, snoozed Claudes left out (summary does both).
      if (this.cfg.deck) await this.sendDeck({ ...summary(model.agents), asks: deckAsks(model.agents, here?.address ?? null), approve: deckApprove(model.agents), usage: deckUsage(this.usage), badge: deckBadge(bd) });
    });
  }

  /** {[address]: "cwd|ref"} for every Claude with a PR to look up. */
  prWanted(raw, names) {
    if (!this.cfg.pr_status) return {};
    const out = {};
    for (const a of raw) {
      const ref = a.cwd && prRef(names[a.address]?.name, a.branch);
      if (ref) out[a.address] = `${a.cwd}|${ref}`;
    }
    return out;
  }

  // Every PR in one `gh api graphql` call, when the set changes, else once a minute.
  // A folder whose origin isn't on GitHub, or a failed batch, falls back to
  // `gh pr view` per PR, one at a time.
  refreshPrs(cx, wanted) {
    if (!this.cfg.pr_status) return;
    const keys = [...new Set(Object.values(wanted))].sort();
    const sig = keys.join("\n");
    if (!keys.length || this.prBusy) return;
    if (sig === this.prSig && this.polls % PR_REFRESH_POLLS !== 0) return;
    this.prBusy = true;
    cx.spawn(async () => {
      try {
        const items = [];
        const rest = [];
        for (const k of keys) {
          const [cwd, ref] = k.split("|");
          const repo = await this.repoFor(cwd);
          if (repo) items.push({ key: k, ref, ...repo });
          else rest.push(k);
        }
        let next = {};
        const { query, aliases } = prQuery(items);
        if (query) {
          const r = await exec(this.cfg.gh, ["api", "graphql", "-f", `query=${query}`]).catch(() => null);
          next = r ? parsePrBatch(r.stdout, aliases) : {};
          // A failed call (offline, an unknown PR number) keeps what it did return
          // and asks gh pr view for the rest; a branch with no PR isn't a failure.
          if (!r || r.code !== 0) rest.push(...items.map((it) => it.key).filter((k) => !(k in next)));
        }
        for (const k of rest) {
          const [cwd, ref] = k.split("|");
          const r = await exec(this.cfg.gh, ["pr", "view", ref, "--json", PR_FIELDS], { cwd }).catch(() => null);
          const pr = r && parsePr(r.stdout);
          if (pr) next[k] = pr;
        }
        this.prs = next;
      } finally {
        this.prSig = sig;
        this.prBusy = false;
      }
    });
  }

  // A folder's GitHub owner/name, from its origin; cached, since remotes rarely move.
  async repoFor(cwd) {
    if (!(cwd in this.repos)) {
      const r = await exec("git", ["-C", cwd, "remote", "get-url", "origin"]).catch(() => null);
      this.repos[cwd] = r ? repoOf(r.stdout) : null;
    }
    return this.repos[cwd];
  }

  /** Names with PR state in the hint: "#1645 ● · title". `rawHint` keeps the names file's hint. */
  withPrs(names, prWanted) {
    const out = {};
    for (const [addr, n] of Object.entries(names)) {
      const pr = this.prs[prWanted[addr]] ?? null;
      out[addr] = pr ? { ...n, hint: [prMark(pr), n.hint].filter(Boolean).join(" · "), rawHint: n.hint ?? null, pr } : n;
    }
    return out;
  }

  // Seconds since the last input; null when unknown (Discord then treats it as away).
  async idleSeconds() {
    try {
      const r = await exec("ioreg", ["-c", "IOHIDSystem", "-d", "4"]);
      return parseHidIdleSeconds(r.stdout);
    } catch {
      return null;
    }
  }

  // First item of a stretch posts the card; later changes edit it in place.
  async sendCard(action) {
    const url = this.cfg.discord_webhook;
    const ep = this.state.episode;
    if (!url || !ep) return;
    const body = buildCard(action.items, ep.since);
    if (action.type === "edit" && ep.messageId) {
      const r = await this.post("discord", `${url}/messages/${ep.messageId}`, body, "PATCH");
      if (r) return;
    }
    const r = await this.post("discord", `${url}?wait=true`, body);
    if (r) {
      try {
        ep.messageId = JSON.parse(await r.text()).id ?? null;
      } catch {
        ep.messageId = null;
      }
    }
  }

  async sendDeck(s) {
    const body = JSON.stringify(s);
    const now = Date.now();
    if (body === this.lastDeck.body && now - this.lastDeck.at < DECK_HEARTBEAT_MS) return;
    this.lastDeck = { body, at: now };
    await this.post("deck", `http://127.0.0.1:${this.cfg.deck_port}/state`, s);
  }

  // Fire one request; log once per outage, not once per poll. Returns the response or null.
  async post(name, url, payload, method = "POST") {
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      this.failing[name] = false;
      return r;
    } catch (e) {
      if (!this.failing[name]) console.log(`herdr-signals: ${name} unreachable: ${e}`);
      this.failing[name] = true;
      return null;
    }
  }

  render(cx) {
    // A scene or view request, a spotlight click, or a rail click that opened
    // the grid shouldn't wait for the next poll: queue one apply pass when
    // they change (only then, so a request that can't land doesn't spin).
    const grid = shared("kit.view") === "grid";
    const asks = [shared("kit.sceneWant") ?? null, shared("kit.viewWant") ?? null, shared("kit.afterView") ?? null];
    const spot = grid ? [shared("kit.spotlight") ?? null, shared("kit.gridFocus") ?? null] : [null, null];
    const askSig = JSON.stringify([...asks, ...spot]);
    if (askSig !== this.askSig) {
      this.askSig = askSig;
      const spotPending = grid && (spot[0] !== (this.spotApplied ?? null) || spot[1] !== null);
      if ((asks.some((x) => x !== null) || spotPending) && !this.applyQueued) {
        this.applyQueued = true;
        cx.timer.after(0, (cx) => { this.applyQueued = false; this.kick(cx); });
      }
    }
    const t = theme();
    // The model's rows carry snooze and wait times; raw agents() only until the first poll.
    const s = summary(this.model?.agents ?? agents());
    const parts = [];
    // A layout or scene-picker problem first; a bad config `look` stays until the config is fixed.
    const problem = this.problem ?? this.lookProblem;
    if (problem) parts.push(div().text_color(t.muted).child(problem));
    // Clicking a count does what cmd-shift-u does.
    const focus = shared("kit.focus");
    parts.push(...stripCounts(t, s, (cx) => this.command("urgent", cx), deckAsks(this.model?.agents ?? [], null).count, Date.now(), (cx) => this.command("next-ask", cx), shared("kit.scene") ?? null));
    const digest = digestLine(t, this.digest, Date.now(), (cx) => this.goDigest(cx));
    if (digest) parts.push(digest);
    if (parts.length === 0) parts.push(div().text_color(t.dim).child("all quiet"));
    const usage = usageItem(t, this.usage);
    if (usage) parts.push(usage);
    if (this.layoutNote) {
      parts.push(div().id("layout-note").text_color(t.muted).tooltip("Herdr changed its main layout, so the kit layout is out of date. Rerun ./install.sh from the main checkout.").child(this.layoutNote));
    } else if (this.focusFallback && !this.focusTree) {
      parts.push(div().id("layout-note").text_color(t.muted).tooltip("The kit's focus layout (layout-focus.json) is missing, so focus was rebuilt from the grid. Rerun ./install.sh from the main checkout.").child(LAYOUT_NOTE));
    }

    // The right-hand buttons keep their place: when the strip is short they lose words (strip-fit.js).
    const sceneKey = shared("kit.scene") ?? null;
    const sceneName = Object.hasOwn(SCENES, sceneKey) ? SCENES[sceneKey].label : null;
    const width = this.stripPx ?? signalsWidth(null);
    const note = this.layoutNote || (this.focusFallback && !this.focusTree) ? LAYOUT_NOTE : null;
    const texts = leftTexts({
      problem, note,
      counts: [
        s.blocked > 0 ? blockedLabel(s, Date.now()) : null,
        deckAsks(this.model?.agents ?? [], null).count > 0 ? "☀☀ 00 asks" : null,
        s.done > 0 ? `✓ ${s.done} DONE` : null,
        s.held > 0 ? heldLabel(s.held) : null,
      ],
      digest: digest ? "✓ 00 finished while you focused (00m)" : null,
    });
    const left = leftPx(texts, usagePx(this.usage)) + (focusOn(focus) ? 60 : 0);
    const buttons = this.addonData("buttons").buttons;
    const level = stripFit(width, left, sceneName, grid, buttons);
    const pin = pinOf(this.writtenTheme);
    const b = buttonTexts(level, sceneName, grid, pin, buttons);
    const btn = (id, text, tip, go) => {
      const el = div().id(id).px(8).rounded(4).cursor_pointer().text_color(t.muted)
        .hover((st) => st.text_color(t.foreground))
        .child(text)
        .on_click((_e, bcx) => go(bcx));
      return level === "full" ? el : el.tooltip(tip);
    };
    // Focus <-> grid switch (cmd-shift-g does the same where installed): a request apply() writes.
    parts.push(div().flex_1());
    parts.push(focusButton(t, focus, Date.now(), () => this.command("focus"), b.focus));
    // Add-on buttons: a click tells the add-on (kit.addon.press), which does the rest.
    buttons.forEach((ab, i) => parts.push(btn(`addon-${ab.id}`, b.addons[i], ab.tip, () => this.press(ab.id))));
    parts.push(btn("scene-open", b.scene, sceneName ? `Scene: ${sceneName}${pin ? `, ${pin} look kept` : ""}. Pick another.` : "Pick a scene", () => this.command("scenes")));
    parts.push(btn("view-switch", b.view, grid ? "Back to the focus view" : "Show the grid", (bcx) => this.command("view-toggle", bcx)));

    return h_flex().id("root").size_full().bg(t.chrome).px(12).gap(16).items_center()
      .text_size(12).children(parts);
  }
}
