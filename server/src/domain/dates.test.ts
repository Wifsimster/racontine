import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, isIsoDate, todayIso } from "./dates.js";

test("une date de calendrier réelle est acceptée, aux bornes comprises", () => {
  for (const date of [
    "2025-11-24",
    "2026-01-01",
    "2026-12-31",
    "2024-02-29", // année bissextile
  ])
    assert.equal(isIsoDate(date), true, date);
});

test("une date mal FORMÉE est refusée", () => {
  for (const value of ["24/11/2025", "2025-11-4", "", "2025-11-24T00:00:00Z"])
    assert.equal(isIsoDate(value), false, value);
});

test("une date bien formée mais IMPOSSIBLE est refusée", () => {
  /* Le cœur du garde-fou : ces quatre-là passaient la forme, n'existent pas,
     et finissaient en écriture refusée par le SGBD — c'est-à-dire en journée
     perdue ou en erreur 500. */
  for (const value of [
    "2025-11-31", // novembre a trente jours
    "2025-02-29", // année commune
    "2026-13-40", // mois et jour hors calendrier
    "2026-00-10", // il n'y a pas de mois zéro
  ])
    assert.equal(isIsoDate(value), false, value);
});

test("la date du jour est toujours une date valide", () => {
  assert.equal(isIsoDate(todayIso()), true);
});

test("le lendemain reste une date valide, y compris au passage de mois", () => {
  assert.equal(addDays("2025-11-30", 1), "2025-12-01");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(isIsoDate(addDays("2025-12-31", 1)), true);
});

test("todayIso suit le fuseau du foyer, pas l'UTC du conteneur", () => {
  // 23 h 30 UTC le 14 = 1 h 30 le 15 à Paris (heure d'été).
  const late = new Date("2026-07-14T23:30:00Z");
  assert.equal(todayIso(late, "Europe/Paris"), "2026-07-15");
  assert.equal(todayIso(late, "UTC"), "2026-07-14");
});
