import assert from "node:assert/strict";
import { test } from "node:test";
import { carnetDay } from "../testing/fakes.js";
import {
  ITEM_KINDS,
  ITEM_TYPES,
  isItemType,
  itemsFromCarnetDay,
  itemsFromNote,
  itemsToNoteLists,
} from "./entry-items.js";

test("le registre couvre exactement les types de moments persistés", () => {
  assert.deepEqual(
    ITEM_KINDS.map((k) => k.type),
    [...ITEM_TYPES],
  );
  assert.ok(isItemType("meal"));
  assert.ok(!isItemType("licorne"));
});

test("une lecture de carnet donne des moments ordonnés et numérotés", () => {
  const rows = itemsFromCarnetDay(
    carnetDay({
      repas: [
        { moment: "midi", contenu: "purée" },
        { moment: "goûter", contenu: "compote" },
      ],
      siestes: [{ debut: "13h", fin: "15h" }],
      activites: ["peinture"],
      anecdotes: ["a dit « encore »"],
      sante: "38,2 °C",
    }),
  );

  assert.deepEqual(
    rows.map((r) => [r.type, r.position]),
    [
      ["meal", 0],
      ["meal", 1],
      ["nap", 2],
      ["activity", 3],
      ["anecdote", 4],
      ["health", 5],
    ],
  );
});

test("une note de santé vide ou blanche ne crée pas de moment", () => {
  assert.equal(itemsFromCarnetDay(carnetDay({ sante: "   " })).length, 0);
  assert.equal(itemsFromCarnetDay(carnetDay({ sante: null })).length, 0);
});

test("écrire puis relire une journée transcrite rend exactement les mêmes listes", () => {
  const note = {
    meals: [{ moment: "midi", contenu: "purée", appetit: "tout mangé" }],
    naps: [{ debut: "13h", fin: "15h10", note: "s'est rendormi" }],
    activities: ["peinture", "jardin"],
    anecdotes: ["a dit « encore »"],
    health: ["38,2 °C au réveil"],
  };

  // L'aller et le retour sont bâtis sur le même registre : ils ne peuvent pas
  // diverger, même le jour où un sixième type de moment apparaît.
  const lists = itemsToNoteLists(itemsFromNote(note));
  assert.deepEqual(lists.meals, note.meals);
  assert.deepEqual(lists.naps, note.naps);
  assert.deepEqual(lists.activities, note.activities);
  assert.deepEqual(lists.anecdotes, note.anecdotes);
  assert.deepEqual(lists.health, note.health);
});

test("les listes de lecture existent même vides, une par type", () => {
  const lists = itemsToNoteLists([]);
  assert.deepEqual(Object.keys(lists).sort(), [
    "activities",
    "anecdotes",
    "health",
    "meals",
    "naps",
  ]);
});
