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
