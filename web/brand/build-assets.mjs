import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { markSVG, silhouetteSVG, GLYPH_R, PAGE, SILHOUETTE, TILE, INK, RADIUS } from "./mark.mjs";
import { lettering } from "./lettering.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "../public");

const PAPER = "#FEFDFA";
const RULE = "#DBDEF1";
const INK_TEXT = "#242846";
const INK_PALE = "#5E6276";
const PRIMARY = "#B8284D";

async function png(svg, size, file, { height, alpha = false, background = TILE } = {}) {
  let pipeline = sharp(Buffer.from(svg), { density: 384 }).resize(size, height ?? size, {
    fit: "fill",
  });
  if (!alpha) pipeline = pipeline.flatten({ background });
  const buf = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(resolve(publicDir, file), buf);
  console.log(`brand: ${file.padEnd(24)} ${size}x${height ?? size}`);
}

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

const OG = { w: 1200, h: 630 };
const AXIS = 96;
const TEXT = 136;

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

await png(markSVG({ variant: "page" }), 192, "pwa-192.png", { alpha: true });
await png(markSVG({ variant: "page" }), 512, "pwa-512.png", { alpha: true });
await png(markSVG({ variant: "page", bleed: true, safeZone: true }), 512, "pwa-maskable-512.png");
await png(markSVG({ variant: "page", bleed: true }), 180, "apple-touch-icon.png");

await png(silhouetteSVG({ color: "#FFFFFF" }), 96, "badge-96.png", { alpha: true });

await png(ogSVG, OG.w, "og.png", { height: OG.h, background: PAPER });
