export const TILE = "#C0435F";
export const INK = "#FAF8F3";
export const RADIUS = 112 / 512;

export const GLYPH_R =
  "M1362 919Q1362 824 1319.0 745.5Q1276 667 1197.5 614.5Q1119 562 1009 542Q969 535 934.0 527.0Q899 519 864.0 513.0Q829 507 785 507Q723 507 667.0 515.5Q611 524 564.0 540.5Q517 557 481 579L487 671Q516 651 554.0 637.0Q592 623 637.5 616.0Q683 609 733 609Q879 609 960.5 686.5Q1042 764 1042 915Q1042 1029 994.0 1116.5Q946 1204 858.0 1254.5Q770 1305 652 1305H564V170Q564 147 575.0 133.0Q586 119 609 112L677 99Q702 90 711.0 78.0Q720 66 720 47Q720 0 658 0H166Q135 0 120.0 13.0Q105 26 105 47Q105 86 147 99L204 112Q229 119 241.5 133.0Q254 147 254 170V1230Q254 1253 241.5 1267.0Q229 1281 204 1288L147 1301Q105 1314 105 1353Q105 1375 120.0 1387.5Q135 1400 166 1400H664Q889 1400 1044.5 1338.5Q1200 1277 1281.0 1168.5Q1362 1060 1362 919ZM785 548 1089 583 1347 171Q1366 141 1385.0 125.0Q1404 109 1437 100Q1469 90 1480.5 78.0Q1492 66 1492 47Q1492 26 1476.5 13.0Q1461 0 1429 0H1003Q943 0 943 47Q943 60 950.0 69.5Q957 79 972 86L1002 93Q1023 103 1026.0 117.0Q1029 131 1014 156Z";

export const PAGE = {
  margin: { x: 112, w: 9, opacity: 0.4 },
  letter: { x: 148, baseline: 344, scale: 0.19 },
  rules: [
    { y: 380, w: 430, h: 9, opacity: 0.22 },
    { y: 426, w: 286, h: 9, opacity: 0.22 },
  ],
};

const COMPACT = {
  capRatio: 300 / 512,
  capRatioMaskable: 260 / 512,
};

const INK_BOUNDS = { x0: 105, x1: 1492 };

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

function pageBody(shrink = 1) {
  const c = 256;
  const t = (v) => c + (v - c) * shrink;
  const s = (v) => v * shrink;

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

export const SILHOUETTE = {
  viewBox: 24,
  rules: [
    { x: 3.2, y: 6.4, w: 17.6, h: 1.9 },
    { x: 3.2, y: 11.05, w: 17.6, h: 1.9 },
    { x: 3.2, y: 15.7, w: 10.4, h: 1.9 },
  ],
  margin: { x: 7, y: 2.6, w: 1.9, h: 18.8 },
};

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
