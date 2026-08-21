import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeJournees } from "./vlm.js";

function day(overrides: Record<string, unknown> = {}) {
  return {
    repas: [],
    siestes: [],
    activites: [],
    anecdotes: [],
    incertitudes: [],
    illisible: false,
    ...overrides,
  };
}

test("normalizeJournees renvoie une seule journée couvrant toutes les pages", () => {
  const raw = { journees: [day({ pages: [1, 2, 3], titre: "Belle journée" })] };
  const days = normalizeJournees(raw, 3);
  assert.equal(days.length, 1);
  assert.deepEqual(days[0].pages, [1, 2, 3]);
  assert.equal(days[0].titre, "Belle journée");
});

test("normalizeJournees découpe plusieurs journées distinctes par pages", () => {
  const raw = {
    journees: [
      day({ pages: [1], date: "2025-11-25", titre: "Mardi" }),
      day({ pages: [2, 3], date: "2025-11-28", titre: "Vendredi" }),
    ],
  };
  const days = normalizeJournees(raw, 3);
  assert.equal(days.length, 2);
  assert.deepEqual(days[0].pages, [1]);
  assert.deepEqual(days[1].pages, [2, 3]);
});

test("normalizeJournees rattache les pages non réclamées à la dernière journée", () => {
  // Le modèle « oublie » la page 3 : elle ne doit pas être perdue.
  const raw = {
    journees: [
      day({ pages: [1], titre: "Jour 1" }),
      day({ pages: [2], titre: "Jour 2" }),
    ],
  };
  const days = normalizeJournees(raw, 3);
  assert.equal(days.length, 2);
  assert.deepEqual(days[1].pages, [2, 3]);
});

test("normalizeJournees crée une journée illisible si aucune page n'est réclamée", () => {
  const days = normalizeJournees({ journees: [] }, 2);
  assert.equal(days.length, 1);
  assert.equal(days[0].illisible, true);
  assert.deepEqual(days[0].pages, [1, 2]);
});

test("normalizeJournees ignore les numéros de page hors bornes ou dupliqués", () => {
  const raw = {
    journees: [
      day({ pages: [1, 1, 99, 0], titre: "Jour 1" }),
      day({ pages: [2], titre: "Jour 2" }),
    ],
  };
  const days = normalizeJournees(raw, 2);
  assert.equal(days.length, 2);
  assert.deepEqual(days[0].pages, [1]);
  assert.deepEqual(days[1].pages, [2]);
});

test("normalizeJournees tolère une entrée malformée (champ manquant)", () => {
  const days = normalizeJournees({ journees: "pas un tableau" }, 2);
  assert.equal(days.length, 1);
  assert.equal(days[0].illisible, true);
});

test("normalizeJournees sépare le mot lu de sa glose dans les incertitudes", () => {
  // Le modèle écrit régulièrement le mot ET son explication dans `original` :
  // c'est `original` qui sera remplacé dans le récit à la relecture, il ne peut
  // donc pas porter la phrase entière. Voir uncertainties.ts.
  const raw = {
    journees: [
      day({
        pages: [1],
        incertitudes: [
          {
            original: "«écrite» : peut-être «éveillée» ou autre mot",
            contexte: "",
            suggestions: [],
          },
        ],
      }),
    ],
  };
  const [d] = normalizeJournees(raw, 1);
  assert.equal(d.incertitudes[0].original, "écrite");
  assert.equal(d.incertitudes[0].contexte, "peut-être «éveillée» ou autre mot");
  assert.deepEqual(d.incertitudes[0].suggestions, ["éveillée"]);
});

test("normalizeJournees laisse intacte une incertitude déjà bien formée", () => {
  const raw = {
    journees: [
      day({
        pages: [1],
        incertitudes: [
          {
            original: "gratin",
            contexte: "écriture serrée en fin de ligne",
            suggestions: ["gratin de courgettes", "gratiné"],
            champ: "recit",
          },
        ],
      }),
    ],
  };
  const [d] = normalizeJournees(raw, 1);
  assert.deepEqual(d.incertitudes[0], {
    original: "gratin",
    contexte: "écriture serrée en fin de ligne",
    suggestions: ["gratin de courgettes", "gratiné"],
    champ: "recit",
  });
});
