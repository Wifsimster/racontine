import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { decodeBase64Image, SERVER_VERSION } from "./mcp.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

test("SERVER_VERSION suit la version du package (pas de valeur figée)", () => {
  assert.match(SERVER_VERSION, /^\d+\.\d+\.\d+/);
  assert.equal(SERVER_VERSION, pkg.version);
});

test("decodeBase64Image décode un base64 nu", () => {
  const raw = Buffer.from("racontine", "utf8");
  const buf = decodeBase64Image(raw.toString("base64"));
  assert.ok(buf);
  assert.equal(buf.toString("utf8"), "racontine");
});

test("decodeBase64Image accepte un préfixe data: URI", () => {
  const raw = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // en-tête JPEG
  const buf = decodeBase64Image(`data:image/jpeg;base64,${raw.toString("base64")}`);
  assert.ok(buf);
  assert.deepEqual([...buf], [...raw]);
});

test("decodeBase64Image tolère les espaces autour de la chaîne", () => {
  const raw = Buffer.from("abc", "utf8");
  const buf = decodeBase64Image(`  ${raw.toString("base64")}  `);
  assert.ok(buf);
  assert.equal(buf.toString("utf8"), "abc");
});

test("decodeBase64Image rejette une chaîne vide", () => {
  assert.equal(decodeBase64Image(""), null);
  assert.equal(decodeBase64Image("   "), null);
  assert.equal(decodeBase64Image("data:image/png;base64,"), null);
});
