import assert from "node:assert/strict";
import { test } from "node:test";
import {
  lastDayOfMonth,
  parseCursor,
  parseFrom,
  parseLimit,
} from "./feed-window.js";

test("le curseur n'accepte qu'un identifiant de journée", () => {
  const id = "0b8f1c3e-5a6d-4e2b-9f10-2c3d4e5f6a7b";
  assert.equal(parseCursor(id), id);
  assert.equal(parseCursor(id.toUpperCase()), id.toUpperCase());
  // Tout le reste est ignoré, jamais refusé : au pire on rend la première page.
  for (const junk of ["", "12", "'; drop table entries;--", 42, null, undefined])
    assert.equal(parseCursor(junk), null);
});

test("le bord de fenêtre n'accepte qu'une date de calendrier réelle", () => {
  assert.equal(parseFrom("2026-03-31"), "2026-03-31");
  assert.equal(parseFrom("2026-02-30"), null);
  assert.equal(parseFrom("mars"), null);
  assert.equal(parseFrom(20260331), null);
});

test("la taille de page est bornée des deux côtés", () => {
  assert.equal(parseLimit(undefined), 20);
  assert.equal(parseLimit("30"), 30);
  assert.equal(parseLimit("1000"), 50);
  assert.equal(parseLimit("0"), 1);
  assert.equal(parseLimit("-5"), 1);
  assert.equal(parseLimit("abc"), 20);
  assert.equal(parseLimit("12.7"), 12);
});

test("« emmène-moi en mars » devient le dernier jour de mars", () => {
  assert.equal(lastDayOfMonth("2026-03"), "2026-03-31");
  assert.equal(lastDayOfMonth("2026-04"), "2026-04-30");
  // Février, année commune puis bissextile.
  assert.equal(lastDayOfMonth("2026-02"), "2026-02-28");
  assert.equal(lastDayOfMonth("2028-02"), "2028-02-29");
  assert.equal(lastDayOfMonth("2026-12"), "2026-12-31");
  assert.equal(lastDayOfMonth("2026-13"), null);
  assert.equal(lastDayOfMonth("2026-00"), null);
  assert.equal(lastDayOfMonth("2026"), null);
});
