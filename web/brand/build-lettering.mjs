import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";

const here = dirname(fileURLToPath(import.meta.url));
const fonts = resolve(here, "../public/fonts");

const FACES = {
  fraunces600: fontkit.openSync(resolve(fonts, "fraunces-600.woff2")),
  nunito400: fontkit.openSync(resolve(fonts, "nunito-400.woff2")),
  nunito700: fontkit.openSync(resolve(fonts, "nunito-700.woff2")),
};

function trace(face, text, trackingEm = 0) {
  const font = FACES[face];
  const track = trackingEm * font.unitsPerEm;
  const run = font.layout(text);
  let x = 0;
  const ds = [];
  run.glyphs.forEach((glyph, i) => {
    const pos = run.positions[i];
    if (glyph.path.commands.length) {
      ds.push(glyph.path.translate(Math.round(x + (pos.xOffset || 0)), 0).toSVG());
    }
    x += pos.xAdvance + track;
  });
  const advance = Math.round(x - track);
  const s = 1000 / font.capHeight;
  return {
    width: Math.round(advance * s),
    transform: `translate(0 1000) scale(${s.toFixed(6)} ${(-s).toFixed(6)})`,
    d: ds.join(""),
  };
}

const items = {
  logotype: trace("fraunces600", "Racontine", -0.018),
  surtitre: trace("nunito700", "CARNET DE LIAISON", 0.14),
  promesse1: trace("nunito400", "Votre carnet de liaison, dématérialisé"),
  promesse2: trace("nunito400", "sans rien demander à la nounou."),
};

const body = Object.entries(items)
  .map(
    ([key, v]) =>
      `  ${key}: {\n    width: ${v.width},\n    transform: ${JSON.stringify(v.transform)},\n    d: ${JSON.stringify(v.d)},\n  },`,
  )
  .join("\n");

writeFileSync(
  resolve(here, "lettering.mjs"),
  `/* ===========================================================================
   LETTRAGE VECTORISÉ — GÉNÉRÉ, NE PAS ÉDITER À LA MAIN.

   Source : web/brand/build-lettering.mjs, depuis les woff2 de web/public/fonts.
   Regénérer : pnpm brand:lettering

   Repère : hauteur de capitale = 1000, origine en haut à gauche, y vers le bas.
   =========================================================================== */

export const lettering = {
${body}
};
`,
);

writeFileSync(
  resolve(here, "logotype.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${items.logotype.width} 1000" role="img" aria-label="Racontine">
  <title>Racontine</title>
  <!-- GÉNÉRÉ par web/brand/build-lettering.mjs — ne pas éditer à la main.
       « Racontine » en Fraunces SemiBold, vectorisé depuis le même woff2 que
       l'app, à l'approche du cran 30/36 (-0,018 em). La hauteur de la boîte de
       vue est la hauteur de CAPITALE : poser le logotype, c'est choisir sa
       capitale, pas deviner une taille de police. -->
  <g fill="currentColor" transform="${items.logotype.transform}">
    <path d="${items.logotype.d}"/>
  </g>
</svg>
`,
);

for (const [key, v] of Object.entries(items)) {
  console.log(`lettering: ${key.padEnd(10)} largeur ${String(v.width).padStart(6)} (capitale 1000)`);
}
console.log("lettering: logotype.svg écrit");
