// What the public repo (scruffyherdr) ships carries no personal string, in a
// file's text or its name, and no picture carries metadata. In herdr-kit the
// shipped set is scripts/ship-list.js's list; in the public repo itself (no
// public/ folder) it is every tracked file. scripts/cut-public.sh runs this
// file over its copy before it commits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IN_PRIVATE = existsSync(join(ROOT, "public"));

// Built from pieces so this file passes its own scan: a macOS home folder,
// account and domain names, a LAN address, notes and recall tools, an
// employer and its ticket keys, a first name, and project names. The account
// name is allowed only as the public repo's own path (the README's clone URL).
// Jira itself is fair game (the kit-jira add-on); a site name isn't.
export const PERSONAL = new RegExp(
  [
    "\\/Us" + "ers\\/", "ball" + "42(?!\\/scruffyherdr(?![\\w-]))", "reli" + "quary", "claude-" + "recall", "ja" + "mf",
    "ball" + "\\.works", "192" + "\\.168\\.", "\\bH" + "AL-\\d", "\\bch" + "ris\\b",
    "plex" + "-hub", "green" + "-thumb", "roll" + "-call", "pick" + "-ems", "Pycharm" + "Projects",
  ].join("|"),
  "i",
);

function tracked() {
  const r = spawnSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split("\n").filter(Boolean);
}

async function shipped() {
  if (!IN_PRIVATE) return tracked();
  const { shipList } = await import("../scripts/ship-list.js");
  return shipList(tracked());
}

const isBinary = (buf) => buf.includes(0);

// The JPEG segments before the image data: only a JFIF APP0, never EXIF or
// XMP (APP1..APP15) or a comment (COM). Returns the problems found.
export function jpegProblems(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return ["not a JPEG"];
  const out = [];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return [...out, `bad marker at ${i}`];
    const m = buf[i + 1];
    if (m === 0xd9 || m === 0xda) break; // end, or start of the image data
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (m === 0xe0) {
      if (buf.toString("latin1", i + 4, i + 9) !== "JFIF\0") out.push("APP0 that isn't JFIF");
    } else if (m >= 0xe1 && m <= 0xef) {
      out.push(`APP${m - 0xe0} segment`);
    } else if (m === 0xfe) {
      out.push("COM segment");
    }
    i += 2 + len;
  }
  return out;
}

const PNG_CHUNKS = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "pHYs"]);
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// The PNG chunks outside the image-only set (text, time, EXIF, ...).
export function pngProblems(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) return ["not a PNG"];
  const out = [];
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    if (!PNG_CHUNKS.has(type)) out.push(`${type} chunk`);
    if (type === "IEND") break;
    i += 12 + len;
  }
  return out;
}

// The binary types that may ship, each with its metadata check.
const BINARY = { jpg: jpegProblems, jpeg: jpegProblems, png: pngProblems };

test("scrub: no shipped file names a personal path, account, tool or project, in its text or its name", async () => {
  const hits = [];
  for (const rel of await shipped()) {
    const name = rel.match(PERSONAL);
    if (name) hits.push(`${rel}: file name has ${name[0]}`);
    const path = join(ROOT, rel);
    if (!existsSync(path)) continue;
    const buf = readFileSync(path);
    if (isBinary(buf)) continue; // pictures: the metadata test below
    buf.toString("utf8").split("\n").forEach((line, i) => {
      const m = line.match(PERSONAL);
      if (m) hits.push(`${rel}:${i + 1}: ${m[0]}`);
    });
  }
  assert.deepEqual(hits, []);
});

test("scrub: shipped pictures carry no metadata, and no other binary type ships", async () => {
  const problems = [];
  let pictures = 0;
  for (const rel of await shipped()) {
    const path = join(ROOT, rel);
    if (!existsSync(path)) continue;
    const buf = readFileSync(path);
    if (!isBinary(buf)) continue;
    const check = BINARY[rel.split(".").pop().toLowerCase()];
    if (!check) {
      problems.push(`${rel}: a binary type the scrub doesn't list`);
      continue;
    }
    pictures++;
    for (const p of check(buf)) problems.push(`${rel}: ${p}`);
  }
  assert.deepEqual(problems, []);
  assert.ok(pictures > 0, "the scan found the scene pictures");
});

// What an editor leaves in an SVG it saves: a metadata block, its own namespaces, comments.
export function svgProblems(text) {
  const out = [];
  if (/<metadata\b/i.test(text)) out.push("a <metadata> block");
  for (const ns of ["inkscape", "sodipodi", "sketch"]) {
    if (text.includes(`${ns}:`) || text.includes(`xmlns:${ns}=`)) out.push(`${ns}: markup`);
  }
  if (text.includes("<!--")) out.push("a comment");
  return out;
}

test("scrub: shipped SVGs carry no editor metadata, namespaces or comments", async () => {
  const problems = [];
  let svgs = 0;
  for (const rel of await shipped()) {
    if (!rel.toLowerCase().endsWith(".svg")) continue;
    const path = join(ROOT, rel);
    if (!existsSync(path)) continue;
    svgs++;
    for (const p of svgProblems(readFileSync(path, "utf8"))) problems.push(`${rel}: ${p}`);
  }
  assert.deepEqual(problems, []);
  assert.ok(svgs > 0, "the scan found the glyph and icon SVGs");
});

test("the SVG check catches metadata, editor namespaces and comments", () => {
  const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14"><path d="M0 0h1v1z"/></svg>';
  assert.deepEqual(svgProblems(ok), []);
  assert.deepEqual(svgProblems('<svg><metadata><rdf:RDF/></metadata></svg>'), ["a <metadata> block"]);
  assert.deepEqual(svgProblems('<svg xmlns:inkscape="x" sodipodi:docname="a.svg"></svg>'), ["inkscape: markup", "sodipodi: markup"]);
  assert.deepEqual(svgProblems('<svg sketch:type="MSPage"><!-- by someone --></svg>'), ["sketch: markup", "a comment"]);
});

test("metadata checks: EXIF and COM in a JPEG, text and EXIF chunks in a PNG", () => {
  const seg = (m, body) => Buffer.concat([Buffer.from([0xff, m]), Buffer.from([0, body.length + 2]), body]);
  const jfif = seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1"));
  const jpeg = (...s) => Buffer.concat([Buffer.from([0xff, 0xd8]), ...s, Buffer.from([0xff, 0xda, 0, 2])]);
  assert.deepEqual(jpegProblems(jpeg(jfif)), []);
  assert.deepEqual(jpegProblems(jpeg(jfif, seg(0xe1, Buffer.from("Exif\0\0")))), ["APP1 segment"]);
  assert.deepEqual(jpegProblems(jpeg(jfif, seg(0xfe, Buffer.from("hello")))), ["COM segment"]);
  const chunk = (type, body = Buffer.alloc(0)) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    return Buffer.concat([len, Buffer.from(type, "latin1"), body, Buffer.alloc(4)]);
  };
  const png = (...c) => Buffer.concat([PNG_SIG, chunk("IHDR", Buffer.alloc(13)), ...c, chunk("IDAT"), chunk("IEND")]);
  assert.deepEqual(pngProblems(png()), []);
  assert.deepEqual(pngProblems(png(chunk("tEXt", Buffer.from("Comment\0/x")), chunk("eXIf"))), ["tEXt chunk", "eXIf chunk"]);
});

test("the scrub's pattern catches each kind of string it guards", () => {
  for (const s of [
    "/Us" + "ers/x", "ball" + "42", "reli" + "quary", "ja" + "mf", "https://" + "ja" + "mf.atlassian.net", "ball" + ".works",
    "192" + ".168.0.1", "H" + "AL-12", "Ch" + "ris", "plex" + "-hub", "Pycharm" + "Projects",
  ]) assert.match(s, PERSONAL, s);
  for (const s of ["/home/me", "the user", "ACME-12", "christmas", "web-app", "kit-jira", "acli", "https://example.atlassian.net"]) {
    assert.doesNotMatch(s, PERSONAL, s);
  }
  // the public repo's own URL is the one place the account name may appear
  assert.doesNotMatch("https://github.com/" + "ball" + "42/scruffyherdr.git", PERSONAL);
  for (const s of ["github.com/" + "ball" + "42/herdr-kit", "ball" + "42/scruffyherdr-private", "@" + "ball" + "42"]) assert.match(s, PERSONAL, s);
});
