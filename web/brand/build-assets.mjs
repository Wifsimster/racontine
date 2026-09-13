/* ===========================================================================
   REGÉNÈRE TOUT CE QUI PORTE LA MARQUE, depuis `mark.mjs` et `lettering.mjs`.

     pnpm brand   (depuis la RACINE du dépôt)

   Les outils de rendu — sharp, fontkit — sont des dépendances de
   développement de la RACINE, jamais de `web`. C'est volontaire : le contexte
   Docker de `web` fait un `pnpm install` complet, et y traîner un binaire natif
   de 30 Mo pour une commande qu'on lance trois fois par an alourdirait chaque
   image du produit.

   Jusqu'ici les icônes étaient refaites à la main, une par une, et le seul
   endroit où leur géométrie était écrite était un commentaire. Une marque dont
   les rendus se refont de mémoire finit par avoir cinq versions légèrement
   différentes d'elle-même. Une commande, une source, sept fichiers.

   Ce qui sort, et pourquoi chaque rendu diffère :

     favicon.svg            état COMPACT. C'est le seul rendu vectoriel, et le
                            seul vu à 16 px : le R doit y occuper toute la
                            tuile, sans quoi ce n'est plus une lettre.
     pwa-192 / pwa-512      état PAGE, plein cadre arrondi.
     pwa-maskable-512       état PAGE, PLEIN BORD (la plateforme pose son
                            propre masque : un dessin déjà arrondi flotterait)
                            et contracté à 72 % pour que le R et le trait de
                            marge tiennent dans la zone sûre — le cercle de
                            80 %, rayon 204,8 px.
     apple-touch-icon       état PAGE, plein bord à 180 px : iOS redessine son
                            squircle, et des coins transparents se composent
                            sur du noir sur les vieux iOS.
     badge-96               la SILHOUETTE, blanche sur transparent. Android ne
                            garde que l'alpha d'une pastille de notification :
                            l'icône en couleur y devenait un carré gris.
     og.png                 la carte de lien, 1200x630. Voir plus bas.
   =========================================================================== */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { markSVG, silhouetteSVG, GLYPH_R, PAGE, SILHOUETTE, TILE, INK, RADIUS } from "./mark.mjs";
import { lettering } from "./lettering.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "../public");

/** Les jetons du produit dont la carte de lien a besoin (web/src/index.css). */
const PAPER = "#FEFDFA"; // --card : la feuille
const RULE = "#DBDEF1"; // --rule : la ligne du cahier
const INK_TEXT = "#242846"; // --foreground : l'encre bleu-nuit
const INK_PALE = "#5E6276"; // --muted-foreground : l'encre pâlie
const PRIMARY = "#B8284D"; // --primary : le groseille de l'action

/**
 * Rend un SVG en PNG. `alpha: false` aplatit le rendu sur la tuile : un PNG
 * d'icône ne doit pas transporter de canal alpha inutile, et de vieux iOS
 * composent les coins transparents sur du NOIR.
 */
async function png(svg, size, file, { height, alpha = false, background = TILE } = {}) {
  let pipeline = sharp(Buffer.from(svg), { density: 384 }).resize(size, height ?? size, {
    fit: "fill",
  });
  if (!alpha) pipeline = pipeline.flatten({ background });
  const buf = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(resolve(publicDir, file), buf);
  console.log(`brand: ${file.padEnd(24)} ${size}x${height ?? size}`);
}

/* ---------------------------------------------------------------------------
   La favicon : le seul rendu qu'on livre en vectoriel.
   --------------------------------------------------------------------------- */
const favicon = markSVG({ variant: "compact" }).replace(
  "<title>Racontine</title>",
  `<title>Racontine</title>
  <!-- GÉNÉRÉ par web/brand/build-assets.mjs — ne pas éditer à la main.
       État COMPACT de la marque : le R seul, capitale à 300/512 (58 %). C'est
       la variante des PETITES tailles, celle de l'onglet. Les icônes d'accueil
       portent l'état PAGE (trait de marge + réglures) : voir web/brand/mark.mjs. -->`,
);
writeFileSync(resolve(publicDir, "favicon.svg"), favicon);
console.log(`brand: ${"favicon.svg".padEnd(24)} vectoriel`);

/* ---------------------------------------------------------------------------
   LA MARQUE, POUR REACT.

   L'app a besoin de la même géométrie, mais en TSX. La recopier dans un
   composant, c'est rouvrir exactement le problème qu'on referme : une marque
   avec deux définitions finit avec deux dessins. Le composant lit donc ce
   fichier généré, et ce fichier sort d'ici.
   --------------------------------------------------------------------------- */
const rects = (list) => JSON.stringify(list);
writeFileSync(
  resolve(here, "../src/components/marque.generated.ts"),
  `/* ===========================================================================
   GÉOMÉTRIE DE LA MARQUE — GÉNÉRÉ, NE PAS ÉDITER À LA MAIN.

   Source : web/brand/mark.mjs, via web/brand/build-assets.mjs.
   Regénérer : pnpm brand

   Les mêmes nombres produisent les icônes PNG, la favicon, la pastille de
   notification, la carte de lien et le composant <Marque />. Il n'y a plus
   qu'un seul dessin de la marque dans le produit.
   =========================================================================== */

export const MARQUE = {
  /** La tuile groseille des écrans d'accueil (plus claire que --primary). */
  tile: "${TILE}",
  /** L'encre de la marque : le papier du produit, pas du blanc pur. */
  ink: "${INK}",
  /** Rayon de la tuile, en fraction du côté. */
  radius: ${RADIUS},
  /** Le R de Fraunces SemiBold, en unités de police (y vers le haut). */
  glyphR: ${JSON.stringify(GLYPH_R)},
  /** L'état PAGE, sur une tuile de 512. */
  page: {
    margin: ${JSON.stringify(PAGE.margin)},
    letter: ${JSON.stringify(PAGE.letter)},
    rules: ${rects(PAGE.rules)},
  },
  /** La silhouette, sur la boîte de 24 de Lucide. */
  silhouette: {
    viewBox: ${SILHOUETTE.viewBox},
    rules: ${rects(SILHOUETTE.rules)},
    margin: ${JSON.stringify(SILHOUETTE.margin)},
  },
} as const;
`,
);
console.log(`brand: ${"marque.generated.ts".padEnd(24)} géométrie React`);

/* ---------------------------------------------------------------------------
   LA CARTE DE LIEN — 1200 x 630.

   Elle n'existait pas, et son absence coûtait précisément là où le produit se
   propage : le lien d'invitation se colle dans un SMS ou un fil WhatsApp, et
   s'y affichait en URL nue, sans titre ni vignette, au moment exact où l'on
   demande à quelqu'un de confier la journée de son petit-enfant.

   Elle est STATIQUE, et c'est une décision : une carte qui contiendrait le
   prénom de l'enfant serait mise en cache par les serveurs de WhatsApp, de
   Slack et de Google. La carte dit le produit ; jamais la famille.

   La composition est celle de la porte de connexion — c'est le même objet, vu
   de l'extérieur : trait de marge à gauche, tout aligné dessus, et la réglure
   UNIQUEMENT sous le bloc de texte. La règle du produit est que la ligne du
   cahier ne traverse jamais les letterformes du nom ; elle vaut aussi ici.
   --------------------------------------------------------------------------- */
const OG = { w: 1200, h: 630 };
const AXIS = 96; // le trait de marge, à 8 % — la marge d'un carnet
const TEXT = 136; // l'axe du texte : 40 px à droite de la marge, comme à la connexion

/** Pose un lettrage à une hauteur de capitale donnée, coin haut-gauche en (x, y). */
function words(item, { x, y, cap, fill }) {
  const k = cap / 1000;
  return `<g fill="${fill}" transform="translate(${x} ${y}) scale(${k})"><g transform="${item.transform}"><path d="${item.d}"/></g></g>`;
}

const ogSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OG.w} ${OG.h}">
  <rect width="${OG.w}" height="${OG.h}" fill="${PAPER}"/>

  <!-- La réglure, sous le texte seulement (pas de ligne en travers d'une lettre). -->
  <rect x="0" y="545" width="${OG.w}" height="2" fill="${RULE}"/>
  <rect x="0" y="593" width="${OG.w}" height="2" fill="${RULE}"/>

  <!-- Le trait de marge : l'axe sur lequel tout est aligné. -->
  <rect x="${AXIS}" y="0" width="3" height="${OG.h}" fill="${PRIMARY}" opacity="0.4"/>

  <!-- La marque, à 88 px, et le surtitre du carnet à sa droite.
       Le détourage est posé sur un élément SANS transformation propre, à
       l'intérieur du groupe mis à l'échelle : un détourage s'applique dans
       l'espace utilisateur de l'élément qui le porte, transformation comprise.
       Un rectangle de détourage de 88 posé sur le groupe mis à l'échelle se
       retrouvait à 15 px, et la tuile devenait une miette. -->
  <g transform="translate(${TEXT} 76) scale(${(88 / 512).toFixed(6)})">
    <clipPath id="og-tile"><rect width="512" height="512" rx="112" ry="112"/></clipPath>
    <g clip-path="url(#og-tile)">
      <rect width="512" height="512" fill="${TILE}"/>
      <rect x="0" y="380" width="430" height="9" fill="${INK}" opacity="0.22"/>
      <rect x="0" y="426" width="286" height="9" fill="${INK}" opacity="0.22"/>
      <rect x="112" y="0" width="9" height="512" fill="${INK}" opacity="0.4"/>
      <path transform="translate(148 344) scale(0.19 -0.19)" fill="${INK}" d="${GLYPH_R}"/>
    </g>
  </g>
  <!-- Capitale du surtitre centrée sur la tuile : 76 + 88/2 - 18/2 = 111. -->
  ${words(lettering.surtitre, { x: TEXT + 112, y: 111, cap: 18, fill: INK_PALE })}

  <!-- Le nom, au cran du bandeau : capitale de 112 px. -->
  ${words(lettering.logotype, { x: TEXT, y: 236, cap: 112, fill: INK_TEXT })}

  <!-- La promesse, en deux lignes — coupée là où on la coupe à l'oral. -->
  ${words(lettering.promesse1, { x: TEXT, y: 404, cap: 31, fill: INK_TEXT })}
  ${words(lettering.promesse2, { x: TEXT, y: 456, cap: 31, fill: INK_TEXT })}
</svg>
`;

// Les icônes d'accueil : l'état PAGE. Coins arrondis pour les tuiles PWA,
// plein bord là où la plateforme masque elle-même.
await png(markSVG({ variant: "page" }), 192, "pwa-192.png", { alpha: true });
await png(markSVG({ variant: "page" }), 512, "pwa-512.png", { alpha: true });
await png(markSVG({ variant: "page", bleed: true, safeZone: true }), 512, "pwa-maskable-512.png");
await png(markSVG({ variant: "page", bleed: true }), 180, "apple-touch-icon.png");

// La pastille de notification : blanche sur TRANSPARENT, Android n'en garde
// que l'alpha.
await png(silhouetteSVG({ color: "#FFFFFF" }), 96, "badge-96.png", { alpha: true });

// La carte de lien.
await png(ogSVG, OG.w, "og.png", { height: OG.h, background: PAPER });
