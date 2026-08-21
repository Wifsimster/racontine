import { test } from "node:test";
import assert from "node:assert/strict";
import { renderEmail, escapeHtml, safeHref } from "./email-template.js";

const base = {
  appName: "Racontine",
  title: "Nouvelle journée de Louise",
  paragraphs: ["La journée du lundi 3 mars vient d'être publiée."],
  action: { label: "Voir la journée", url: "https://carnet.local/entries/42" },
};

test("le gabarit rend les deux versions, texte et HTML", () => {
  const { text, html } = renderEmail(base);
  // Le texte reste lisible seul : corps, action, signature.
  assert.match(text, /La journée du lundi 3 mars/);
  assert.match(text, /Voir la journée : https:\/\/carnet\.local\/entries\/42/);
  assert.match(text, /— Racontine, le journal de l'enfance/);
  // Le HTML est un document complet, pas un fragment.
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<\/html>$/);
});

test("le HTML porte l'identité du produit : nom, groseille, serif, réglure", () => {
  const { html } = renderEmail(base);
  // Le nom de l'instance apparaît en en-tête ET en signature.
  assert.equal(html.match(/Racontine/g)?.length, 2);
  // La groseille (--primary) et le papier (--background) du design system.
  assert.match(html, /#b8284d/);
  assert.match(html, /#f9f7f2/);
  // L'indigo générique d'avant a disparu.
  assert.doesNotMatch(html, /#4f46e5/i);
  // Les polices du produit sont en tête de pile, avec un repli système.
  assert.match(html, /font-family:Fraunces,[^"]*serif/);
  assert.match(html, /font-family:Nunito,[^"]*sans-serif/);
});

test("le nom de l'instance personnalisé remplace « Racontine » partout", () => {
  const { text, html } = renderEmail({
    ...base,
    appName: "Le carnet de Jules",
  });
  assert.match(html, /Le carnet de Jules/);
  assert.doesNotMatch(html, /Racontine/);
  assert.match(text, /— Le carnet de Jules, le journal de l'enfance/);
});

test("le mode sombre est prévu, sans dépendre des styles en ligne", () => {
  const { html } = renderEmail(base);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  // Les surfaces repeintes le sont en !important : sinon le style en ligne gagne.
  assert.match(html, /\.r-card \{ background: #1d202c !important/);
  assert.match(html, /name="color-scheme" content="light dark"/);
});

test("le bouton d'action pointe sur l'URL, en tableau (Outlook)", () => {
  const { html } = renderEmail(base);
  assert.match(html, /<a href="https:\/\/carnet\.local\/entries\/42"/);
  assert.match(html, />Voir la journée<\/a>/);
});

test("aucune image ni ressource externe à charger", () => {
  const { html } = renderEmail(base);
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /<link/i);
  assert.doesNotMatch(html, /url\(/i);
});

test("le texte saisi par un utilisateur est échappé, jamais interprété", () => {
  const { html } = renderEmail({
    ...base,
    title: 'Journée de <script>alert("x")</script>',
    greeting: "Bonjour <b>Mamie</b>,",
    paragraphs: ['Le journal d\'"Émile" & Cie'],
  });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>Mamie<\/b>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&quot;Émile&quot; &amp; Cie/);
});

test("une URL non http(s) ne devient jamais un lien", () => {
  const { html } = renderEmail({
    ...base,
    action: { label: "Voir la journée", url: "javascript:alert(1)" },
  });
  assert.doesNotMatch(html, /href="javascript:/);
  // Le destinataire garde l'information, en clair, sans lien actif.
  assert.match(html, /Voir la journée : javascript:alert\(1\)/);
});

test("safeHref n'accepte que http et https", () => {
  assert.equal(safeHref("https://carnet.local/x"), "https://carnet.local/x");
  assert.equal(safeHref("http://localhost:5173/x"), "http://localhost:5173/x");
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,<b>x</b>"), null);
  assert.equal(safeHref("pas une url"), null);
});

test("escapeHtml couvre les cinq caractères dangereux", () => {
  assert.equal(
    escapeHtml(`<a href="x" title='y'>&</a>`),
    "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
  );
});

test("les parties optionnelles sont omises proprement", () => {
  const { text, html } = renderEmail({
    appName: "Racontine",
    title: "Un mot",
    paragraphs: ["Rien à faire, juste à lire."],
  });
  assert.doesNotMatch(html, /<a href=/);
  assert.match(html, /Rien à faire, juste à lire\./);
  assert.doesNotMatch(text, /undefined/);
  assert.doesNotMatch(html, /undefined/);
});

test("le pré-en-tête retombe sur le premier paragraphe", () => {
  const { html } = renderEmail(base);
  assert.match(
    html,
    /mso-hide:all">La journée du lundi 3 mars vient d&#39;être publiée\.<\/div>/,
  );
});
