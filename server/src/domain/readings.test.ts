import assert from "node:assert/strict";
import { test } from "node:test";
import { applyResolvedReading, resolveUncertaintyAt } from "./readings.js";

const fields = {
  title: "Roueil au parc",
  story: "Roueil a ri.",
  highlight: "Un câlin",
  transcription: null,
};

test("le mot tranché est remplacé partout où il apparaît vraiment", () => {
  const patch = applyResolvedReading(fields, "Roueil", "Noureil");
  assert.deepEqual(patch, {
    title: "Noureil au parc",
    story: "Noureil a ri.",
  });
});

test("un champ sans le mot n'est pas réécrit", () => {
  const patch = applyResolvedReading(fields, "papillon", "papillons");
  assert.deepEqual(patch, {});
});

test("trancher une incertitude ne touche pas les autres", () => {
  const before = [
    { original: "a", contexte: "", suggestions: [], champ: null, resolved: null },
    { original: "b", contexte: "", suggestions: [], champ: null, resolved: null },
  ];
  const after = resolveUncertaintyAt(before, 1, "B");
  assert.equal(after[0].resolved, null);
  assert.equal(after[1].resolved, "B");
  assert.equal(before[1].resolved, null); // l'entrée d'origine n'est pas mutée
});
