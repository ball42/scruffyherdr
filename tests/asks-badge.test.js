import { test } from "node:test";
import assert from "node:assert/strict";
import { askCards } from "../claude/cards.js";
import "./support/gpui-stub.js";

const { openItems } = await import("../herdr/mods/kit-rail/look.js");

test("askCards reads each ? Ask card in the action items", () => {
  const msg = "Done.\n\n## Your action items\n\n**▶ Run:** build\n\n```sh\nnpm run build\n```\n\n**? Ask:** which box?\n\n**? Ask:** what name?";
  assert.deepEqual(askCards(msg), ["which box?", "what name?"]);
  assert.deepEqual(askCards("**? Ask:** outside the section"), []);
});

test("openItems lists the decision, then runs, then asks", () => {
  const a = { card: "decide", ask: "Ship now?", runs: [{ label: "build" }], asks: ["which box?"] };
  assert.deepEqual(openItems(a), ["◆ Ship now?", "▶ build", "? which box?"]);
  assert.deepEqual(openItems({ card: "run", ask: "ignored", runs: [], asks: [] }), []);
});

test("openItems leaves out runs that went clean, keeps failed and unrun ones", () => {
  const a = { runs: [
    { label: "ok", state: { state: "done", exit: 0 } },
    { label: "bad", state: { state: "done", exit: 2 } },
    { label: "new", state: null },
  ], asks: [] };
  assert.deepEqual(openItems(a), ["▶ bad", "▶ new"]);
});
