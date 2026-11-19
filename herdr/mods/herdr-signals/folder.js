// Which names files to (re)read. A hook write used to reread the whole folder
// (101 files on 2026-11-10); now a watch event reads only the paths it names,
// and the 30 s safety net reads only files whose mtime or size moved.
// Pure: no herdr globals, no I/O.

const NAME_FILE = /^([A-Za-z0-9_-]+)\.json$/;

/** "<terminal>.json" -> "<terminal>", else null. */
export function nameKey(file) {
  return String(file).match(NAME_FILE)?.[1] ?? null;
}

const base = (p) => String(p).replace(/\/+$/, "").split("/").pop();

/**
 * The names files a watchFolder batch touched, as base names. null means
 * reread everything: the batch held the folder itself (Herdr's "pending paths
 * overflowed" signal) or was empty.
 */
export function changedFiles(paths, dir) {
  const root = String(dir).replace(/\/+$/, "");
  if (!Array.isArray(paths) || paths.length === 0) return null;
  const out = new Set();
  for (const p of paths) {
    const clean = String(p).replace(/\/+$/, "");
    if (clean === root) return null;
    if (!clean.startsWith(`${root}/`)) continue;
    const f = base(clean);
    if (nameKey(f)) out.add(f);
  }
  return [...out];
}

/** `stat -f '%Fm %z %N'` lines -> {file: "mtime size"} for names files only. */
export function parseStamps(stdout) {
  const out = {};
  for (const line of String(stdout ?? "").split("\n")) {
    const m = line.match(/^(\S+) (\d+) (.+)$/);
    if (!m) continue;
    const f = base(m[3]);
    if (nameKey(f)) out[f] = `${m[1]} ${m[2]}`;
  }
  return out;
}

/** Files whose stamp is new or changed (to read), and files that went away (to drop). */
export function stampDiff(prev, next) {
  const read = Object.keys(next).filter((f) => prev[f] !== next[f]).sort();
  const gone = Object.keys(prev).filter((f) => !(f in next)).sort();
  return { read, gone };
}

/**
 * `files` ({terminal: parsed}) with `results` applied: [file, parsed|undefined|null].
 * A parsed object replaces the entry; null (the file is gone) removes it;
 * undefined (half-written or junk) keeps what was there until the next write.
 */
export function applyReads(files, results) {
  const out = { ...files };
  for (const [f, d] of results) {
    const k = nameKey(f);
    if (!k) continue;
    if (d === null) delete out[k];
    else if (d && typeof d === "object") out[k] = d;
  }
  return out;
}

// ctx/<terminal> files (written by claude/ctx-tap.mjs) untouched for a week.
export const CTX_KEEP_MIN = 7 * 24 * 60;

/** `find` args that delete stale ctx files, never anything below the folder. */
export function pruneCtxArgs(dir) {
  return [dir, "-maxdepth", "1", "-type", "f", "-mmin", `+${CTX_KEEP_MIN}`, "-delete"];
}

// names/bg-<session>.json: a Claude Code background session's file. Its daemon
// worker kept the HC_TERMINAL_ID of the terminal it was started from, so the
// hook keys it by session instead (claude/name-hook.mjs fileKey).
const BG_KEY = /^bg-/;

/** A title as a terminal shows it, compared loosely: Claude's spinner glyph and spaces off, case folded. */
export function titleKey(s) {
  return String(s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * `files` ({key: parsed}) with each background session's file also under the
 * address of the agent whose terminal title is that session's /rename name or
 * title. Only a one-to-one match moves: a file two terminals' titles match, or
 * an agent two files match, stays put. An agent whose own file matches its
 * title keeps its own.
 */
export function homeBackground(agents, files) {
  const bg = Object.keys(files ?? {}).filter((k) => BG_KEY.test(k));
  if (!bg.length) return files;
  const titles = (f) => [f?.name, f?.hint].map(titleKey).filter(Boolean);
  const want = {};
  for (const a of agents ?? []) {
    const t = titleKey(a.title);
    if (!t || BG_KEY.test(a.address)) continue;
    const own = files[a.address];
    if (own && titles(own).includes(t)) continue;
    const m = bg.filter((k) => titles(files[k]).includes(t));
    if (m.length === 1) want[a.address] = m[0];
  }
  const claims = {};
  for (const k of Object.values(want)) claims[k] = (claims[k] ?? 0) + 1;
  const out = { ...files };
  for (const [addr, k] of Object.entries(want)) if (claims[k] === 1) out[addr] = files[k];
  return out;
}
