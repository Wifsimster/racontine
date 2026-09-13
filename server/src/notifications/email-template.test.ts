import { test } from "node:test";
import assert from "node:assert/strict";
import { renderEntryEmail, renderLinkEmail } from "./email-template.js";
import type { DayChip } from "../domain/day-glance.js";

/* ===========================================================================
   L'e-mail de publication est la SEULE surface du produit qui sorte de chez
   vous : un proche lecteur — mamie, le parrain — le reçoit le soir et clique,
   parfois sans jamais ouvrir l'app.

   Ces tests verrouillent deux choses qui se sont déjà perdues une fois :

   1. LA MARQUE. Le gabarit portait `system-ui`, une encre #1f2937 et un bouton
      #4f46e5 — l'indigo par défaut de la bibliothèque d'origine, alors que dans
      le vocabulaire chromatique du produit l'indigo veut dire « sieste ». Une
      couleur hors palette qui revient doit faire rougir la CI, pas se
      découvrir dans une boîte de réception.
   2. L'ÉCHAPPEMENT. Le prénom de l'enfant, le nom du destinataire et l'humeur
      sont saisis par des utilisateurs ou écrits par le modèle. Interpolés
      bruts, ils ouvrent une injection de balises dans un e-mail — c'est-à-dire
      un lien de phishing ou une image traçante dans le message que le produit
      envoie lui-même.
   =========================================================================== */

const JOURNEE = {
  greeting: "Bonjour Mamie,",
  body: "La journée du mardi 8 septembre vient d'être publiée dans le journal de Léa.",
  link: "https://racontine.test/entries/abc-123",
  childName: "Léa",
  dateLabel: "mardi 8 septembre",
  chips: [
    { label: "2 repas", tone: "meal" },
    { label: "sieste 2 h 05", tone: "nap" },
    { label: "joyeuse", tone: "mood" },
  ] as DayChip[],
};

test("l'e-mail porte les couleurs du carnet, et aucune autre", () => {
  const { html } = renderEntryEmail(JOURNEE);

  // Le papier, l'encre, le groseille de l'action.
  assert.match(html, /#F9F7F2/);
  assert.match(html, /#242846/);
  assert.match(html, /#B8284D/);

  // Les feutres de la bande : repas (or brûlé), sieste (indigo).
  assert.match(html, /#7D4A1E/);
  assert.match(html, /#3F4E97/);

  // L'indigo par défaut de la bibliothèque d'origine, et les gris qui allaient
  // avec : plus jamais.
  assert.doesNotMatch(html, /#4f46e5/i);
  assert.doesNotMatch(html, /#1f2937/i);
  assert.doesNotMatch(html, /#6b7280/i);
});

test("l'humeur n'emprunte le feutre d'aucun type de moment", () => {
  const { html } = renderEntryEmail(JOURNEE);
  // L'humeur n'est pas un moment : à l'écran elle reste à l'encre, et cette
  // absence de feutre EST une information. Le prune veut dire « anecdote » ;
  // s'il colorait « joyeuse » ici, une teinte dirait deux choses.
  assert.doesNotMatch(html, /#7C3B8B|#F8E8FB/); // anecdote
  assert.doesNotMatch(html, /#0E653F|#D9F5E3/); // activité
  assert.doesNotMatch(html, /#A52B1E|#FFE7E0/); // santé
  // Elle porte le neutre du produit : --muted, sur l'encre.
  assert.match(html, /#EBECF2/);
});

test("le titre tombe sur le repli sérif déclaré du produit, pas sur une webfont", () => {
  const { html } = renderEntryEmail(JOURNEE);
  // Aucune webfont ne charge dans la plupart des clients de messagerie.
  assert.doesNotMatch(html, /Fraunces|fonts\.googleapis|@font-face/);
  assert.match(html, /font-family:Georgia/);
});

test("l'e-mail montre la journée qu'il annonce — la même bande qu'à l'écran", () => {
  const { html, text } = renderEntryEmail(JOURNEE);
  for (const chip of JOURNEE.chips) {
    assert.ok(html.includes(chip.label), `la pastille « ${chip.label} » manque au HTML`);
  }
  // La version texte n'est pas un pense-bête : elle porte la même bande.
  assert.match(text, /2 repas · sieste 2 h 05 · joyeuse/);
  assert.match(text, /Propulsé par Racontine/);
});

test("une journée sans moment lisible n'affiche pas de bande vide", () => {
  const { html, text } = renderEntryEmail({ ...JOURNEE, chips: [] });
  assert.doesNotMatch(html, /border-radius:999px/);
  // Et le texte ne laisse pas deux sauts de ligne à la place de la bande.
  assert.doesNotMatch(text, /\n\n\n/);
});

test("la signature ne dépend d'aucun réglage d'instance", () => {
  const { html } = renderEntryEmail(JOURNEE);
  assert.match(html, /Propulsé par Racontine/);
});

test("le prénom de l'enfant est échappé avant d'entrer dans le HTML", () => {
  const { html } = renderEntryEmail({
    ...JOURNEE,
    childName: '<img src=x onerror="alert(1)">',
  });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test("le texte d'une pastille est échappé lui aussi", () => {
  const { html } = renderEntryEmail({
    ...JOURNEE,
    // L'humeur sort du modèle de vision : elle n'est pas plus sûre qu'une saisie.
    chips: [{ label: '<b>joyeuse</b>', tone: "mood" }],
  });
  assert.doesNotMatch(html, /<b>joyeuse<\/b>/);
  assert.match(html, /&lt;b&gt;joyeuse/);
});

test("le lien d'ouverture est celui qu'on a passé, et il est encodé", () => {
  const { html } = renderEntryEmail(JOURNEE);
  assert.match(html, /href="https:\/\/racontine\.test\/entries\/abc-123"/);
});

/* ===========================================================================
   LES E-MAILS DE LIEN. Ils partaient en texte brut : un objet et une URL nue.
   C'est le premier contact d'un proche avec Racontine, et le message le plus
   facile à imiter du produit — ces tests tiennent ce qui le rend
   reconnaissable, et ce qui ne doit jamais y entrer.
   =========================================================================== */

const LIEN = "https://racontine.test/api/auth/magic-link/verify?token=abc-123";
const GENRES = ["connexion", "mot-de-passe", "invitation"] as const;

test("les trois liens portent la coquille du carnet, et aucune autre couleur", () => {
  for (const kind of GENRES) {
    const { html } = renderLinkEmail({ kind, url: LIEN });
    assert.match(html, /#F9F7F2/, kind); // le papier
    assert.match(html, /#242846/, kind); // l'encre
    assert.match(html, /#B8284D/, kind); // le groseille de l'action
    assert.match(html, /Carnet de liaison/, kind);
    assert.match(html, /Propulsé par Racontine/, kind);
    assert.doesNotMatch(html, /#4f46e5/i, kind);
  }
});

test("chaque lien dit ce qu'il fait — un objet nu ne suffit pas", () => {
  const connexion = renderLinkEmail({ kind: "connexion", url: LIEN });
  assert.match(connexion.html, /Votre lien de connexion/);
  assert.match(connexion.html, /Ouvrir le carnet/);

  const motDePasse = renderLinkEmail({ kind: "mot-de-passe", url: LIEN });
  assert.match(motDePasse.html, /Choisir un nouveau mot de passe/);
  // Celui-là doit dire quoi faire quand on n'a RIEN demandé : c'est le seul
  // des trois qui peut arriver à quelqu'un qui se fait attaquer.
  assert.match(motDePasse.html, /ignorez ce message/);

  const invitation = renderLinkEmail({ kind: "invitation", url: LIEN });
  assert.match(invitation.html, /invité·e à suivre un enfant/);
  assert.match(invitation.html, /Voir le journal/);
});

test("les deux versions sortent de la même source et portent le même lien", () => {
  for (const kind of GENRES) {
    const { text, html } = renderLinkEmail({ kind, url: LIEN });
    assert.ok(text.includes(LIEN), kind);
    assert.match(html, /href="https:\/\/racontine\.test/, kind);
    // La phrase qui vaut pour les trois : ces URL SONT des identifiants.
    assert.ok(text.includes("Ce lien est personnel"), kind);
    assert.match(html, /Ce lien est personnel/, kind);
  }
});

test("aucune image distante, aucun pixel de suivi", () => {
  /* Une image distante serait bloquée par défaut chez les clients les plus
     prudents — la marque disparaîtrait précisément chez eux — et un pixel
     dirait à Racontine qui a ouvert son courrier. La tuile est dessinée en
     tableau, et il n'y a pas un seul `<img>`. */
  for (const kind of GENRES) {
    const { html } = renderLinkEmail({ kind, url: LIEN });
    assert.doesNotMatch(html, /<img/i, kind);
    assert.doesNotMatch(html, /background-image/i, kind);
  }
});

test("une URL à paramètres reste intacte et encodée dans le bouton", () => {
  const url = "https://racontine.test/invite/jeton?x=1&y=2";
  const { html, text } = renderLinkEmail({ kind: "invitation", url });
  assert.match(html, /href="https:\/\/racontine\.test\/invite\/jeton\?x=1&y=2"/);
  assert.ok(text.includes(url));
});
