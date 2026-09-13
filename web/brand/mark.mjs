/* ===========================================================================
   LA MARQUE DE RACONTINE — la source, et la seule.

   Avant ce fichier, le produit portait TROIS marques : la tuile « R » à
   l'onglet et sur l'écran d'accueil, une icône de catalogue (`BookOpenText`)
   dans l'en-tête de l'app — qui était aussi l'icône de l'entrée de menu « Le
   journal » —, et rien du tout sur l'écran de connexion. Trois réponses à la
   question « à quoi reconnaît-on Racontine ». Tout ce qui porte la marque part
   désormais d'ici : le favicon, les icônes PWA, la pastille de notification,
   la carte de lien, et le composant React de l'en-tête.

   ── LA MARQUE GRANDIT AVEC SA TAILLE ──────────────────────────────────────
   Le commentaire de l'ancienne favicon disait déjà l'essentiel : « à 16 px, un
   R de 6 px n'est plus une lettre, c'est une tache ». On n'essaie donc PAS de
   faire tenir un seul dessin de 16 à 1200 px. Deux états, et le seuil est
   celui de la lisibilité :

     COMPACTE  (< 64 px)  le R seul, cap 300/512 — c'est tout ce qui survit
                          dans un onglet, et c'est le dessin déjà en place.
     PAGE      (>= 64 px) le même R, mais POSÉ : le trait de marge traverse la
                          tuile de haut en bas, le R s'écrit juste à sa droite
                          comme un prénom en haut d'une page, et deux réglures
                          vides courent dessous — la seconde s'arrêtant court,
                          comme une phrase qu'on n'a pas finie.

   Ce n'est pas une figure de style : la réglure et le trait de marge sont
   DÉJÀ la signature du produit (`.paper-ruled`, `--rule-margin`), employés sur
   chaque écran. La marque cesse d'être une lettre dans une boîte — que
   n'importe quel produit en R pourrait porter — pour devenir la seule chose
   que Racontine dessine partout ailleurs.

   ── LA SILHOUETTE ─────────────────────────────────────────────────────────
   La même page, sans tuile et en UNE couleur, pour les deux contextes qui
   n'acceptent rien d'autre : la pastille de notification Android (le système
   n'en garde que l'alpha — une tuile pleine y devient un carré gris) et la
   signature « Propulsé par Racontine » posée sur du papier.

   ── LES COULEURS ──────────────────────────────────────────────────────────
   Le groseille des icônes d'accueil (#C0435F) n'est pas `--primary`
   (#B8284D) : il est d'un cran plus clair, parce qu'une tuile d'écran
   d'accueil est vue sur un fond photographique quelconque, pas sur du papier.
   C'est la valeur déjà en production depuis la v1.17.0 ; on n'y touche pas.
   =========================================================================== */

/** La tuile, telle qu'elle est posée sur les écrans d'accueil depuis la v1.17.0. */
export const TILE = "#C0435F";
/** L'encre de la marque : le papier du produit, pas du blanc pur. */
export const INK = "#FAF8F3";
/** Rayon de la tuile, en fraction du côté (112/512). */
export const RADIUS = 112 / 512;

/**
 * Le R de Fraunces SemiBold, en contour.
 *
 * Tracé en unités de la police (upem 2000, hauteur de capitale 1400), y vers
 * le HAUT : d'où le `scale(s -s)` de chaque emploi. Aucune dépendance à une
 * police installée — le même dessin sur toutes les plateformes, et le même que
 * le logotype de `web/brand/logotype.svg`, qui sort de la même fonte.
 */
export const GLYPH_R =
  "M1362 919Q1362 824 1319.0 745.5Q1276 667 1197.5 614.5Q1119 562 1009 542Q969 535 934.0 527.0Q899 519 864.0 513.0Q829 507 785 507Q723 507 667.0 515.5Q611 524 564.0 540.5Q517 557 481 579L487 671Q516 651 554.0 637.0Q592 623 637.5 616.0Q683 609 733 609Q879 609 960.5 686.5Q1042 764 1042 915Q1042 1029 994.0 1116.5Q946 1204 858.0 1254.5Q770 1305 652 1305H564V170Q564 147 575.0 133.0Q586 119 609 112L677 99Q702 90 711.0 78.0Q720 66 720 47Q720 0 658 0H166Q135 0 120.0 13.0Q105 26 105 47Q105 86 147 99L204 112Q229 119 241.5 133.0Q254 147 254 170V1230Q254 1253 241.5 1267.0Q229 1281 204 1288L147 1301Q105 1314 105 1353Q105 1375 120.0 1387.5Q135 1400 166 1400H664Q889 1400 1044.5 1338.5Q1200 1277 1281.0 1168.5Q1362 1060 1362 919ZM785 548 1089 583 1347 171Q1366 141 1385.0 125.0Q1404 109 1437 100Q1469 90 1480.5 78.0Q1492 66 1492 47Q1492 26 1476.5 13.0Q1461 0 1429 0H1003Q943 0 943 47Q943 60 950.0 69.5Q957 79 972 86L1002 93Q1023 103 1026.0 117.0Q1029 131 1014 156Z";

/* ---------------------------------------------------------------------------
   GÉOMÉTRIE DE L'ÉTAT « PAGE », exprimée sur une tuile de 512.

   Les valeurs ne sont pas des réglages libres : le trait de marge est à
   112/512, c'est-à-dire à la MÊME fraction que le retrait de `.paper-ruled`
   (1,5 rem sur une colonne de 26 rem) ; les deux réglures sont espacées de
   46/512, la fraction du pas de 28 px sur la carte du journal.
   --------------------------------------------------------------------------- */
export const PAGE = {
  /** Trait de marge : abscisse, largeur, opacité. */
  margin: { x: 112, w: 9, opacity: 0.4 },
  /** Le R : abscisse de départ, ligne de base, échelle appliquée aux unités de police. */
  letter: { x: 148, baseline: 344, scale: 0.19 },
  /** Les deux réglures. La seconde s'arrête court : la phrase n'est pas finie. */
  rules: [
    { y: 380, w: 430, h: 9, opacity: 0.22 },
    { y: 426, w: 286, h: 9, opacity: 0.22 },
  ],
};

/** Géométrie de l'état compact — celle qui est en production depuis la v1.17.0. */
const COMPACT = {
  /** Hauteur de capitale rapportée au côté de la tuile. */
  capRatio: 300 / 512,
  /** Hauteur de capitale de l'icône masquable : réduite pour la zone sûre. */
  capRatioMaskable: 260 / 512,
};

/**
 * Bornes ENCRÉES du R, en unités de police — pas sa chasse.
 *
 * Centrer sur la chasse décalerait la lettre de 11 px sur 512 : la chasse d'un
 * R de Fraunces porte une approche à droite qui ne se voit pas. Ces deux
 * nombres sont ce qui donne le `translate(84.89 …)` de la favicon en
 * production depuis la v1.17.0, et il ne doit pas bouger.
 */
const INK_BOUNDS = { x0: 105, x1: 1492 };

/** Le R, centré dans un carré de `side`, à la hauteur de capitale demandée. */
function centeredLetter(side, capRatio) {
  const scale = (capRatio * side) / 1400;
  const cap = 1400 * scale;
  const inked = (INK_BOUNDS.x1 - INK_BOUNDS.x0) * scale;
  const x = (side - inked) / 2 - INK_BOUNDS.x0 * scale;
  const baseline = (side + cap) / 2;
  return `<path transform="translate(${round(x)} ${round(baseline)}) scale(${round(scale, 6)} ${round(-scale, 6)})" fill="${INK}" d="${GLYPH_R}"/>`;
}

function round(n, digits = 2) {
  return Number(n.toFixed(digits));
}

/**
 * L'état PAGE, dessiné dans un carré de 512, éventuellement contracté vers le
 * centre par `shrink` (l'icône masquable : la plateforme pose SON masque, et
 * tout ce qui compte doit tenir dans un cercle de 80 %).
 *
 * Les réglures débordent volontairement à gauche : après contraction elles
 * atteignent toujours le bord de la tuile, parce qu'une ligne de cahier ne
 * s'arrête pas avant le bord de la page.
 */
function pageBody(shrink = 1) {
  const c = 256;
  const t = (v) => c + (v - c) * shrink;
  const s = (v) => v * shrink;

  // Abscisse pré-transformation d'où partir pour atteindre x=0 après contraction.
  const bleedLeft = c - c / shrink;

  const rules = PAGE.rules
    .map(
      (r) =>
        `<rect x="${round(t(bleedLeft))}" y="${round(t(r.y))}" width="${round(s(r.w - bleedLeft))}" height="${round(s(r.h))}" fill="${INK}" opacity="${r.opacity}"/>`,
    )
    .join("\n  ");

  const margin = `<rect x="${round(t(PAGE.margin.x))}" y="0" width="${round(s(PAGE.margin.w))}" height="512" fill="${INK}" opacity="${PAGE.margin.opacity}"/>`;

  const scale = PAGE.letter.scale * shrink;
  const letter = `<path transform="translate(${round(t(PAGE.letter.x))} ${round(t(PAGE.letter.baseline))}) scale(${round(scale, 6)} ${round(-scale, 6)})" fill="${INK}" d="${GLYPH_R}"/>`;

  return `${rules}\n  ${margin}\n  ${letter}`;
}

/**
 * La marque, en SVG complet.
 *
 * @param {object} o
 * @param {"compact"|"page"} o.variant  l'état (voir l'en-tête du fichier)
 * @param {boolean} o.bleed     plein bord, sans coins arrondis : la plateforme
 *                              pose son propre masque (Android, iOS)
 * @param {boolean} o.safeZone  contracte le dessin dans le cercle de 80 % que
 *                              les icônes masquables Android doivent respecter
 * @param {string}  o.title     le libellé accessible
 */
export function markSVG({
  variant = "page",
  bleed = false,
  safeZone = false,
  title = "Racontine",
} = {}) {
  const body =
    variant === "compact"
      ? centeredLetter(512, safeZone ? COMPACT.capRatioMaskable : COMPACT.capRatio)
      : pageBody(safeZone ? 0.72 : 1);

  // L'état COMPACT tient dans la tuile : un rectangle arrondi suffit, et c'est
  // le balisage déjà en production. L'état PAGE, lui, fait volontairement
  // déborder ses réglures jusqu'au bord — il lui faut un vrai détourage.
  const rounded = !bleed && variant === "compact";
  const clipped = !bleed && variant !== "compact";

  const tile = rounded
    ? `<rect width="512" height="512" rx="${round(RADIUS * 512)}" ry="${round(RADIUS * 512)}" fill="${TILE}"/>`
    : `<rect width="512" height="512" fill="${TILE}"/>`;

  const inner = `${tile}\n  ${body}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${title}">
  <title>${title}</title>
${
  clipped
    ? `  <clipPath id="page"><rect width="512" height="512" rx="${round(RADIUS * 512)}" ry="${round(RADIUS * 512)}"/></clipPath>
  <g clip-path="url(#page)">
  ${inner}
  </g>`
    : `  ${inner}`
}
</svg>
`;
}

/* ---------------------------------------------------------------------------
   LA SILHOUETTE — la page, en une couleur, sur une boîte de 24.

   La boîte de 24 n'est pas un hasard : c'est celle de Lucide. La silhouette
   doit pouvoir se poser à côté d'une icône de l'app sans être d'un demi-pixel
   plus grande ou plus petite qu'elle.

   Trois réglures ici, pas deux : sans la tuile ni la lettre, il faut que la
   forme se lise comme une page écrite. Le trait de marge reste le seul élément
   qui puisse porter le groseille quand la silhouette est posée sur du papier.
   --------------------------------------------------------------------------- */
export const SILHOUETTE = {
  viewBox: 24,
  /** Les réglures : la dernière s'arrête court, comme sur la tuile. */
  rules: [
    { x: 3.2, y: 6.4, w: 17.6, h: 1.9 },
    { x: 3.2, y: 11.05, w: 17.6, h: 1.9 },
    { x: 3.2, y: 15.7, w: 10.4, h: 1.9 },
  ],
  /** Le trait de marge. */
  margin: { x: 7, y: 2.6, w: 1.9, h: 18.8 },
};

/** La silhouette en SVG complet, d'une seule couleur, fond transparent. */
export function silhouetteSVG({ color = "#FFFFFF", title = "Racontine" } = {}) {
  const r = (o) =>
    `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="${o.h / 2}" fill="${color}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SILHOUETTE.viewBox} ${SILHOUETTE.viewBox}" role="img" aria-label="${title}">
  <title>${title}</title>
  ${SILHOUETTE.rules.map(r).join("\n  ")}
  ${r(SILHOUETTE.margin)}
</svg>
`;
}
