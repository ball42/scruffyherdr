// README tabs: every space whose repo has a README keeps a kit-readme tab
// first, so a space with no terminal or Claude left shows its README.
// Pure: main.js does the git / ls lookups and runs the commands.

export const README_MOD = "kit-readme";
export const README_TAB = "README";
/** After asking for a tab, wait this long for it to show in panes() before asking again. */
export const README_PENDING_MS = 15000;

/** The folder to look for a space's README in: its first terminal's live
 *  folder (tab order, then pane order), else the folder the space was made in. */
export function spaceFolder(space, panes) {
  const order = new Map(space.tabs.map((t) => [t.id, t.index]));
  let best = null;
  for (const p of panes) {
    if (!p.terminal || !p.cwd || !order.has(p.tab)) continue;
    if (!best || order.get(p.tab) < order.get(best.tab)) best = p;
  }
  return best ? best.cwd : space.folder || null;
}

/** True when one of the space's tabs already has a kit-readme pane. */
export function hasReadmeTab(space, panes) {
  const ids = new Set(space.tabs.map((t) => t.id));
  return panes.some((p) => p.mod === README_MOD && ids.has(p.tab));
}

/** Spaces that need a README tab now: on this machine, none yet, not asked for
 *  recently. Returns [{ space, folder }]; main.js resolves folder to a README. */
export function readmeNeeds(spaces, panes, pending, now) {
  const out = [];
  for (const s of spaces) {
    if (s.machine) continue;
    if (hasReadmeTab(s, panes)) continue;
    if (pending[s.id] != null && now - pending[s.id] < README_PENDING_MS) continue;
    const folder = spaceFolder(s, panes);
    if (folder) out.push({ space: s, folder });
  }
  return out;
}

/** README tabs not first in their space, as [{ tab, space }]. tab.new adds a
 *  tab last, and the new tab isn't in spaces() until a later poll, so the move
 *  happens here. Skips tabs moved within README_PENDING_MS. */
export function readmeMoves(spaces, panes, moved, now) {
  const out = [];
  for (const s of spaces) {
    if (s.machine) continue;
    const ids = new Set(s.tabs.map((t) => t.id));
    const tab = panes.find((p) => p.mod === README_MOD && ids.has(p.tab))?.tab;
    const info = tab && s.tabs.find((t) => t.id === tab);
    if (!info || info.index === 1) continue;
    if (moved[tab] != null && now - moved[tab] < README_PENDING_MS) continue;
    out.push({ tab, space: s.id });
  }
  return out;
}

/** The README among a folder's file names: README.md first, then any
 *  readme / readme.md / readme.markdown / readme.txt, any case. */
export function pickReadme(names) {
  if (names.includes("README.md")) return "README.md";
  return names.find((n) => /^readme(\.(md|markdown|txt))?$/i.test(n)) ?? null;
}
