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

import { PERSONAL, TICKETS, scrubText } from "../scripts/scrub-patterns.js";

export { PERSONAL, TICKETS, scrubText };

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

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Binary, so the picture checks below see it, not the text scan: a NUL byte,
// a picture's magic or name, or bytes that aren't UTF-8. A JPEG can hold no NUL.
const BINARY_NAMES = /\.(jpe?g|png|gif|webp|ico|icns|bmp|tiff?|pdf|zip|gz|woff2?|ttf|otf|mp4|mov)$/i;
const UTF8 = new TextDecoder("utf-8", { fatal: true });
export function isBinary(buf, rel = "") {
  if (buf.includes(0) || BINARY_NAMES.test(rel)) return true;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf.subarray(0, 8).equals(PNG_SIG)) return true;
  try {
    UTF8.decode(buf);
    return false;
  } catch {
    return true;
  }
}

// The JPEG's segments, before and between its scans: only a JFIF APP0, never
// EXIF or XMP (APP1..APP15) or a comment (COM), and nothing after the end
// marker. Returns the problems found.
export function jpegProblems(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return ["not a JPEG"];
  const out = [];
  let i = 2;
  while (i + 2 <= buf.length) {
    if (buf[i] !== 0xff) return [...out, `bad marker at ${i}`];
    const m = buf[i + 1];
    if (m === 0xff) { i += 1; continue; } // fill byte
    if (m === 0xd9) {
      const after = buf.length - (i + 2);
      return after ? [...out, `${after} bytes after the end`] : out;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    if (i + 4 > buf.length) break;
    const len = buf.readUInt16BE(i + 2);
    if (m === 0xe0) {
      if (buf.toString("latin1", i + 4, i + 9) !== "JFIF\0") out.push("APP0 that isn't JFIF");
    } else if (m >= 0xe1 && m <= 0xef) {
      out.push(`APP${m - 0xe0} segment`);
    } else if (m === 0xfe) {
      out.push("COM segment");
    }
    i += 2 + len;
    if (m === 0xda) {
      // The scan's data runs to the next marker: 0xFF00 is a stuffed byte and
      // 0xFFD0..D7 a restart, both part of the data.
      while (i + 1 < buf.length && !(buf[i] === 0xff && buf[i + 1] !== 0x00 && !(buf[i + 1] >= 0xd0 && buf[i + 1] <= 0xd7))) i++;
      if (i + 1 >= buf.length) break;
    }
  }
  return [...out, "no end marker"];
}

const PNG_CHUNKS = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "pHYs"]);

// The PNG chunks outside the image-only set (text, time, EXIF, ...), and
// anything after IEND.
export function pngProblems(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) return ["not a PNG"];
  const out = [];
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    if (!PNG_CHUNKS.has(type)) out.push(`${type} chunk`);
    i += 12 + len;
    if (type === "IEND") {
      const after = buf.length - i;
      return after > 0 ? [...out, `${after} bytes after IEND`] : out;
    }
  }
  return [...out, "no IEND chunk"];
}

// The binary types that may ship, each with its metadata check.
const BINARY = { jpg: jpegProblems, jpeg: jpegProblems, png: pngProblems };

test("scrub: no shipped file names a personal path, account, tool or project, in its text or its name", async () => {
  const hits = [];
  for (const rel of await shipped()) {
    for (const m of scrubText(rel)) hits.push(`${rel}: file name has ${m}`);
    const path = join(ROOT, rel);
    if (!existsSync(path)) continue;
    const buf = readFileSync(path);
    if (isBinary(buf, rel)) continue; // pictures: the metadata test below
    buf.toString("utf8").split("\n").forEach((line, i) => {
      for (const m of scrubText(line)) hits.push(`${rel}:${i + 1}: ${m}`);
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
    if (!isBinary(buf, rel)) continue;
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
  const jpeg = (...s) => Buffer.concat([Buffer.from([0xff, 0xd8]), ...s, Buffer.from([0xff, 0xda, 0, 2, 0x12, 0xff, 0x00, 0x34, 0xff, 0xd9])]);
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

test("the scrub catches private ticket keys and machine and tracker names, case-sensitive for keys", () => {
  for (const s of ["H" + "K-14", "see HER" + "DR-40", "Click" + "Up badges", "sonic" + "book", "new" + "mini"]) {
    assert.notDeepEqual(scrubText(s), [], s);
  }
  // Herdr's own version in a fixture name, and any lower-case word with a number, stay fine.
  for (const s of ["herdr-0.1.15-main.json", "hk-style", "ACME-12", "a new mini map"]) assert.deepEqual(scrubText(s), [], s);
});

test("the scrub catches the first name beside an underscore or the last name, and a bare login, but not christmas or football", () => {
  for (const s of ["ch" + "ris_notes", "/home/" + "Ch" + "risBall/x", "ch" + "ris" + "ball", "ssh " + "ball" + "@host", "Ball" + "@example.org"]) {
    assert.notDeepEqual(scrubText(s), [], s);
  }
  for (const s of ["christmas", "Christopher Robin", "football@club.org", "a ball game", "baseball@x"]) assert.deepEqual(scrubText(s), [], s);
});

test("the picture checks catch bytes after a JPEG's or PNG's end, and a JPEG with no end", () => {
  const seg = (m, body) => Buffer.concat([Buffer.from([0xff, m]), Buffer.from([0, body.length + 2]), body]);
  const jfif = seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1"));
  const soi = Buffer.from([0xff, 0xd8]);
  // entropy data with a stuffed 0xFF00 and a restart marker, then the end
  const scan = Buffer.from([0xff, 0xda, 0, 2, 0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]);
  const eoi = Buffer.from([0xff, 0xd9]);
  assert.deepEqual(jpegProblems(Buffer.concat([soi, jfif, scan, eoi])), []);
  assert.deepEqual(jpegProblems(Buffer.concat([soi, jfif, scan, eoi, Buffer.from("/home/someone")])), ["13 bytes after the end"]);
  assert.deepEqual(jpegProblems(Buffer.concat([soi, jfif, scan])), ["no end marker"]);
  // a second scan (progressive) whose segments come after the first: still checked
  assert.deepEqual(jpegProblems(Buffer.concat([soi, jfif, scan, seg(0xfe, Buffer.from("hi")), scan, eoi])), ["COM segment"]);
  const chunk = (type, body = Buffer.alloc(0)) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    return Buffer.concat([len, Buffer.from(type, "latin1"), body, Buffer.alloc(4)]);
  };
  const png = Buffer.concat([PNG_SIG, chunk("IHDR", Buffer.alloc(13)), chunk("IDAT"), chunk("IEND")]);
  assert.deepEqual(pngProblems(png), []);
  assert.deepEqual(pngProblems(Buffer.concat([png, Buffer.from("tail")])), ["4 bytes after IEND"]);
  assert.deepEqual(pngProblems(png.subarray(0, png.length - 12)), ["no IEND chunk"]);
});

test("a picture or other binary with no NUL byte is still binary, so the picture checks see it", () => {
  // An EXIF segment 257 bytes long, so even its length field has no zero byte.
  const seg = Buffer.concat([Buffer.from([0xff, 0xe1, 0x01, 0x01]), Buffer.from("Exif"), Buffer.alloc(251, 0x41)]);
  const nulFreeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), seg, Buffer.from([0xff, 0xd9])]);
  assert.ok(!nulFreeJpeg.includes(0), "the planted JPEG has no NUL");
  assert.equal(isBinary(nulFreeJpeg, "a.jpg"), true);
  assert.deepEqual(jpegProblems(nulFreeJpeg), ["APP1 segment"], "and the picture check then flags its EXIF");
  assert.equal(isBinary(nulFreeJpeg, "a.txt"), true, "the JPEG magic, whatever the name");
  assert.equal(isBinary(Buffer.from([0x41, 0xc3, 0x28, 0x42]), "notes.md"), true, "not UTF-8");
  assert.equal(isBinary(Buffer.from("plain text\n"), "a.png"), true, "a picture's name");
  assert.equal(isBinary(Buffer.from("plain text, caf\u00e9\n"), "a.md"), false);
});
