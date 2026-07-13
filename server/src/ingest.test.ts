import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTranscribedEntry,
  DATE_RE,
  ingestCarnetImages,
  SOURCES,
  todayIso,
} from "./ingest.js";

test("todayIso renvoie une date AAAA-MM-JJ", () => {
  assert.match(todayIso(), DATE_RE);
});

test("DATE_RE n'accepte que le format AAAA-MM-JJ", () => {
  assert.ok(DATE_RE.test("2026-07-12"));
  assert.ok(!DATE_RE.test("12/07/2026"));
  assert.ok(!DATE_RE.test("2026-7-2"));
});

// Les validations de métadonnées d'`ingestCarnetImages` se font AVANT tout accès
// base : ces cas d'erreur reviennent donc sans dépendre d'une connexion Postgres.

test("ingestCarnetImages rejette une date mal formée (400) sans toucher la base", async () => {
  const res = await ingestCarnetImages({
    userId: "u1",
    images: [Buffer.from("x")],
    date: "12-07-2026",
  });
  assert.deepEqual(res, {
    ok: false,
    httpCode: 400,
    error: "date invalide (attendu AAAA-MM-JJ)",
  });
});

test("ingestCarnetImages rejette une source inconnue (400) sans toucher la base", async () => {
  const res = await ingestCarnetImages({
    userId: "u1",
    images: [Buffer.from("x")],
    date: "2026-07-12",
    source: "ecole",
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.httpCode, 400);
    assert.match(res.error, /source invalide/);
  }
});

test("ingestCarnetImages rejette une absence de photo (400)", async () => {
  const res = await ingestCarnetImages({
    userId: "u1",
    images: [],
    date: "2026-07-12",
    source: SOURCES[0],
  });
  assert.deepEqual(res, {
    ok: false,
    httpCode: 400,
    error: "aucune photo fournie",
  });
});

// Les validations date/source de `createTranscribedEntry` précèdent, elles aussi,
// tout accès base : ces cas d'erreur ne dépendent d'aucune connexion Postgres.

test("createTranscribedEntry rejette une date mal formée (400) sans toucher la base", async () => {
  const res = await createTranscribedEntry({
    userId: "u1",
    date: "12-07-2026",
    story: "Belle journée.",
  });
  assert.deepEqual(res, {
    ok: false,
    httpCode: 400,
    error: "date invalide (attendu AAAA-MM-JJ)",
  });
});

test("createTranscribedEntry rejette une source inconnue (400) sans toucher la base", async () => {
  const res = await createTranscribedEntry({
    userId: "u1",
    date: "2026-07-12",
    source: "ecole",
    story: "Belle journée.",
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.httpCode, 400);
    assert.match(res.error, /source invalide/);
  }
});
