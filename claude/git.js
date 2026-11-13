import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** The checked-out branch at cwd, read from .git/HEAD (worktrees too); null when detached or not a repo. */
export function gitBranch(cwd) {
  if (typeof cwd !== "string" || !cwd) return null;
  for (let d = resolve(cwd); ; d = dirname(d)) {
    let git = join(d, ".git");
    try {
      if (statSync(git).isFile()) git = resolve(d, readFileSync(git, "utf8").replace(/^gitdir:\s*/, "").trim());
      const m = readFileSync(join(git, "HEAD"), "utf8").match(/^ref: refs\/heads\/(.+)$/m);
      return m ? m[1] : null;
    } catch {
      if (dirname(d) === d) return null;
    }
  }
}
