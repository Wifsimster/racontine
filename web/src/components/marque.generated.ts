/* ===========================================================================
   GÉOMÉTRIE DE LA MARQUE — GÉNÉRÉ, NE PAS ÉDITER À LA MAIN.

   Source : web/brand/mark.mjs, via web/brand/build-assets.mjs.
   Regénérer : pnpm brand

   Les mêmes nombres produisent les icônes PNG, la favicon, la pastille de
   notification, la carte de lien et le composant <Marque />. Il n'y a plus
   qu'un seul dessin de la marque dans le produit.
   =========================================================================== */

export const MARQUE = {
  /** La tuile groseille des écrans d'accueil (plus claire que --primary). */
  tile: "#C0435F",
  /** L'encre de la marque : le papier du produit, pas du blanc pur. */
  ink: "#FAF8F3",
  /** Rayon de la tuile, en fraction du côté. */
  radius: 0.21875,
  /** Le R de Fraunces SemiBold, en unités de police (y vers le haut). */
  glyphR: "M1362 919Q1362 824 1319.0 745.5Q1276 667 1197.5 614.5Q1119 562 1009 542Q969 535 934.0 527.0Q899 519 864.0 513.0Q829 507 785 507Q723 507 667.0 515.5Q611 524 564.0 540.5Q517 557 481 579L487 671Q516 651 554.0 637.0Q592 623 637.5 616.0Q683 609 733 609Q879 609 960.5 686.5Q1042 764 1042 915Q1042 1029 994.0 1116.5Q946 1204 858.0 1254.5Q770 1305 652 1305H564V170Q564 147 575.0 133.0Q586 119 609 112L677 99Q702 90 711.0 78.0Q720 66 720 47Q720 0 658 0H166Q135 0 120.0 13.0Q105 26 105 47Q105 86 147 99L204 112Q229 119 241.5 133.0Q254 147 254 170V1230Q254 1253 241.5 1267.0Q229 1281 204 1288L147 1301Q105 1314 105 1353Q105 1375 120.0 1387.5Q135 1400 166 1400H664Q889 1400 1044.5 1338.5Q1200 1277 1281.0 1168.5Q1362 1060 1362 919ZM785 548 1089 583 1347 171Q1366 141 1385.0 125.0Q1404 109 1437 100Q1469 90 1480.5 78.0Q1492 66 1492 47Q1492 26 1476.5 13.0Q1461 0 1429 0H1003Q943 0 943 47Q943 60 950.0 69.5Q957 79 972 86L1002 93Q1023 103 1026.0 117.0Q1029 131 1014 156Z",
  /** L'état PAGE, sur une tuile de 512. */
  page: {
    margin: {"x":112,"w":9,"opacity":0.4},
    letter: {"x":148,"baseline":344,"scale":0.19},
    rules: [{"y":380,"w":430,"h":9,"opacity":0.22},{"y":426,"w":286,"h":9,"opacity":0.22}],
  },
  /** La silhouette, sur la boîte de 24 de Lucide. */
  silhouette: {
    viewBox: 24,
    rules: [{"x":3.2,"y":6.4,"w":17.6,"h":1.9},{"x":3.2,"y":11.05,"w":17.6,"h":1.9},{"x":3.2,"y":15.7,"w":10.4,"h":1.9}],
    margin: {"x":7,"y":2.6,"w":1.9,"h":18.8},
  },
} as const;
