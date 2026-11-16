#!/usr/bin/env node
// Reads text on stdin and fails when it carries a personal string or a private
// ticket key (scripts/scrub-patterns.js). CI pipes each PR's title, body and
// commit messages through it, since the public history keeps them for good.
import { readFileSync } from "node:fs";
import { scrubText } from "./scrub-patterns.js";

const hits = [];
readFileSync(0, "utf8").split("\n").forEach((line, i) => {
  for (const m of scrubText(line)) hits.push(`line ${i + 1}: ${m}`);
});
if (hits.length) {
  console.error(`scrub: ${hits.length} personal string(s) in the PR text or commits:`);
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}
console.log("scrub: PR text and commits are clean");
