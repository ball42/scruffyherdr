// The permission prompt the Stream Deck's "Herdr approve" key offers. Pure: no herdr globals, no I/O.

export const APPROVE_DETAIL_MAX = 120;

const isRemote = (address) => String(address).includes("/");

/**
 * The blocked Claude whose permission prompt waits longest, or null. `agents`
 * is the model's rows in rail order; snoozed Claudes (row flag, or listed in
 * `snoozed`), Claudes on another machine, and prompts the hook didn't record
 * are left out. Ties go to rail order. `since` is when it started waiting (ms),
 * which the key uses to tell one prompt from the next.
 */
export function deckApprove(agents, snoozed = []) {
  const muted = new Set(snoozed);
  let best = null;
  for (const a of agents ?? []) {
    if (a.status !== "blocked" || a.snoozed || muted.has(a.address) || isRemote(a.address)) continue;
    if (!a.perm || typeof a.perm.tool !== "string" || !a.perm.tool) continue;
    const since = typeof a.attention?.since === "number" ? a.attention.since : null;
    // A Claude with no known start waits longest of none, so it never beats one with a time.
    if (best && !(since !== null && (best.since === null || since < best.since))) continue;
    best = { a, since };
  }
  if (!best) return null;
  const { a, since } = best;
  const detail = Array.from(String(a.perm.detail ?? "").replace(/\s+/g, " ").trim()).slice(0, APPROVE_DETAIL_MAX).join("");
  const name = Array.from(String(a.name ?? a.address)).slice(0, 40).join("");
  const out = { address: a.address, name, tool: a.perm.tool, detail, since };
  // Bash's recorded description, so the deck can tell it from a second command line.
  if (typeof a.perm.description === "string" && a.perm.description.trim()) {
    out.description = Array.from(a.perm.description.replace(/\s+/g, " ").trim()).slice(0, APPROVE_DETAIL_MAX).join("");
  }
  return out;
}
