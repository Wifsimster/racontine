import assert from "node:assert/strict";
import { test } from "node:test";
import { dayChips } from "./day-glance.js";

const meal = { type: "meal" as const, data: { moment: "midi", contenu: "purée" } };
const nap = (debut?: string, fin?: string) => ({
  type: "nap" as const,
  data: { debut, fin },
});

test("les trois questions du soir, dans l'ordre : manger, dormir, l'humeur", () => {
  assert.deepEqual(
    dayChips({
      items: [meal, meal, nap("13h", "15h05")],
      mood: "joyeuse",
    }),
    [
      { label: "2 repas", tone: "meal" },
      { label: "sieste 2 h 05", tone: "nap" },
      { label: "joyeuse", tone: "mood" },
    ],
  );
});

test("le nombre du mot dit si la durée est un cumul", () => {
  const une = dayChips({ items: [nap("13h", "14h")], mood: null });
  assert.equal(une[0].label, "sieste 1 h");
  const deux = dayChips({
    items: [nap("10h", "10h30"), nap("13h", "14h")],
    mood: null,
  });
  assert.equal(deux[0].label, "siestes 1 h 30");
});

test("une sieste sans heures lisibles se compte, faute de se mesurer", () => {
  assert.deepEqual(dayChips({ items: [nap()], mood: null }), [
    { label: "1 sieste", tone: "nap" },
  ]);
});

test("une humeur longue est coupée sur un mot, jamais au milieu d'un mot", () => {
  assert.deepEqual(dayChips({ items: [], mood: "joyeuse et très bavarde" }), [
    { label: "joyeuse", tone: "mood" },
  ]);
  assert.deepEqual(
    dayChips({ items: [], mood: "absolument extraordinairement ravie" }),
    [{ label: "absolument\u2026", tone: "mood" }],
  );
  assert.deepEqual(
    dayChips({ items: [], mood: "extraordinairement ravie" }),
    [],
  );
});

test("une journée sans rien de lisible n'a pas de bande", () => {
  assert.deepEqual(
    dayChips({
      items: [{ type: "activity", data: { label: "peinture" } }],
      mood: null,
    }),
    [],
  );
});
