import assert from "node:assert/strict";
import { test } from "node:test";
import { todayIso } from "./dates.js";
import { isSource, normalizeEntryMetadata } from "./entry-metadata.js";

test("sans métadonnées, une journée est celle d'aujourd'hui chez la nounou", () => {
  assert.deepEqual(normalizeEntryMetadata({}), {
    ok: true,
    value: { date: todayIso(), source: "nounou" },
  });
});

test("une date mal formée est refusée avec sa phrase", () => {
  assert.deepEqual(normalizeEntryMetadata({ date: "01/02/2026" }), {
    ok: false,
    httpCode: 400,
    error: "date invalide (attendu AAAA-MM-JJ)",
  });
});

test("un lieu inconnu est refusé, les quatre connus sont acceptés", () => {
  const refused = normalizeEntryMetadata({ source: "ecole" });
  assert.equal(refused.ok, false);
  for (const source of ["nounou", "mam", "creche", "maison"]) {
    assert.ok(isSource(source));
    assert.equal(normalizeEntryMetadata({ source }).ok, true);
  }
});
