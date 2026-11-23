// The strings the public repo never carries, in a file, a file name, a PR's
// title or body, or a commit message. tests/scrub.test.js scans the tracked
// files with them; scripts/scrub-text.mjs scans text on stdin (CI runs it over
// each PR's title, body and commits).
//
// Built from pieces so this file passes its own scan: a macOS home folder,
// account and domain names, a LAN address, notes and recall tools, an
// employer and its ticket keys, a first name, project names, machine names and
// a tracker. A first name counts with anything but a letter beside it (an
// underscore, a digit), and with the last name run on; a login counts bare
// (user@host). The account name is allowed only as the public repo's own path
// (the README's clone URL). Jira itself is fair game (the kit-jira add-on); a
// site name isn't.
export const PERSONAL = new RegExp(
  [
    "\\/Us" + "ers\\/", "ball" + "42(?!\\/scruffyherdr(?![\\w-]))", "reli" + "quary", "claude-" + "recall", "ja" + "mf",
    "ball" + "\\.works", "192" + "\\.168\\.", "\\bH" + "AL-\\d", "(?<![a-z])ch" + "ris(?:ball|(?![a-z]))", "\\bball" + "@",
    "plex" + "-hub", "green" + "-thumb", "roll" + "-call", "pick" + "-ems", "Pycharm" + "Projects",
    "click" + "up", "sonic" + "book", "\\bnew" + "mini\\b",
  ].join("|"),
  "i",
);

// Private ticket keys, upper case only, so Herdr's own "herdr-0.1.15" passes.
export const TICKETS = new RegExp("\\b(?:H" + "K|HER" + "DR)-\\d+", "g");

/** Every personal string or private ticket key in `text`. */
export function scrubText(text) {
  const out = [];
  const p = String(text).match(new RegExp(PERSONAL.source, "gi"));
  if (p) out.push(...p);
  const t = String(text).match(TICKETS);
  if (t) out.push(...t);
  return out;
}
