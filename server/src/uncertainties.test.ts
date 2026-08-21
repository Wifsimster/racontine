import assert from "node:assert/strict";
import { test } from "node:test";
import {
  stripOuterQuotes,
  tidyUncertainties,
  tidyUncertainty,
} from "./uncertainties.js";
import type { Uncertainty } from "./db/schema.js";

function u(overrides: Partial<Uncertainty> = {}): Uncertainty {
  return {
    original: "",
    contexte: "",
    suggestions: [],
    champ: null,
    resolved: null,
    ...overrides,
  };
}

test("un mot déjà propre traverse la remise en forme intact", () => {
  const item = u({
    original: "gratin",
    contexte: "écriture serrée en fin de ligne",
    suggestions: ["gratin", "gratiné"],
  });
  assert.deepEqual(tidyUncertainty(item), item);
});

test("les guillemets englobants tombent, le mot reste", () => {
  assert.equal(tidyUncertainty(u({ original: "« Roueil »" })).original, "Roueil");
  assert.equal(tidyUncertainty(u({ original: '"Roueil"' })).original, "Roueil");
  assert.equal(stripOuterQuotes("« Roueil »"), "Roueil");
});

test("le mot cité est détaché de sa glose, qui devient le contexte", () => {
  const t = tidyUncertainty(
    u({
      original:
        "«Roueil» : mot incertain après «Nounour» dans la ligne du matin, lecture incertaine",
    }),
  );
  assert.equal(t.original, "Roueil");
  assert.equal(
    t.contexte,
    "mot incertain après «Nounour» dans la ligne du matin, lecture incertaine",
  );
});

test("sans citation, le deux-points fait la coupe", () => {
  const t = tidyUncertainty(
    u({ original: "Roueil : lecture incertaine, écriture peu lisible" }),
  );
  assert.equal(t.original, "Roueil");
  assert.equal(t.contexte, "lecture incertaine, écriture peu lisible");
});

test("les lectures alternatives citées dans la glose deviennent des suggestions", () => {
  const t = tidyUncertainty(
    u({ original: "«écrite» : peut-être «éveillée» ou autre mot" }),
  );
  assert.equal(t.original, "écrite");
  assert.deepEqual(t.suggestions, ["éveillée"]);
});

test("une citation qui sert de repère ne devient PAS une suggestion", () => {
  // « après «Nounour» » dit OÙ se trouve le mot douteux, pas comment le lire :
  // proposer « Nounour » comme lecture de rechange serait une fausse piste.
  const t = tidyUncertainty(
    u({
      original:
        "«Roueil» : mot incertain après «Nounour» dans la ligne du matin, lecture incertaine",
    }),
  );
  assert.equal(t.original, "Roueil");
  assert.deepEqual(t.suggestions, []);
  assert.match(t.contexte, /après «Nounour»/);
});

test("une suggestion donnée par le modèle prime sur celles glanées dans la glose", () => {
  const t = tidyUncertainty(
    u({
      original: "«nu jeu d'eau» : probablement «un peu d'eau»",
      suggestions: ["un peu d'eau", "un jeu d'eau"],
    }),
  );
  assert.equal(t.original, "nu jeu d'eau");
  assert.deepEqual(t.suggestions, ["un peu d'eau", "un jeu d'eau"]);
});

test("le contexte fourni par le modèle n'est jamais écrasé par la glose", () => {
  const t = tidyUncertainty(
    u({
      original: "«joue de la haut» : probablement «flûte»",
      contexte: "fin de la deuxième page, ligne des activités",
    }),
  );
  assert.equal(t.original, "joue de la haut");
  assert.equal(t.contexte, "fin de la deuxième page, ligne des activités");
});

test("une phrase sans mot isolable est laissée telle quelle", () => {
  // Le signalement « pages du <date> » posé par l'ingestion : pas de citation,
  // pas de deux-points, rien à couper — il doit survivre au nettoyage.
  const item = u({
    original: "pages du 2025-11-24",
    contexte: "Une journée du 2025-11-24 déjà publiée a été détectée.",
  });
  assert.deepEqual(tidyUncertainty(item), item);
});

test("une citation trop longue pour être un mot ne devient pas le mot", () => {
  const long = "a".repeat(60);
  const t = tidyUncertainty(u({ original: `«${long}» : illisible` }));
  assert.equal(t.original, `«${long}» : illisible`);
});

test("`resolved` et `champ` traversent la remise en forme", () => {
  const t = tidyUncertainty(
    u({
      original: "«Ninon» : prénom incertain",
      champ: "recit",
      resolved: "Manon",
    }),
  );
  assert.equal(t.original, "Ninon");
  assert.equal(t.champ, "recit");
  assert.equal(t.resolved, "Manon");
});

test("tidyUncertainties tolère les anciens tableaux de chaînes", () => {
  assert.deepEqual(tidyUncertainties(["gratin"]), [
    { original: "gratin", contexte: "", suggestions: [], champ: null, resolved: null },
  ]);
});

test("tidyUncertainties écarte le vide et ce qui n'est pas un tableau", () => {
  assert.deepEqual(tidyUncertainties(null), []);
  assert.deepEqual(tidyUncertainties([u({ original: "   " }), u()]), []);
});
