import { isIsoDate } from "./dates.js";

/* ===========================================================================
   LA FENÊTRE DU JOURNAL — où commence une page, et jusqu'où elle va.

   Le fil se paginait par DÉCALAGE (`offset`), et un décalage ment dès que la
   liste bouge : une journée publiée pendant qu'on lit décale tout d'un cran, la
   page suivante renvoie une journée déjà affichée, et la dernière du lot passe
   à la trappe. Le front compensait déjà à la main en dédoublonnant par id — le
   symptôme était dans le code, pas la cause.

   Une page se demande donc désormais par CURSEUR : « la suite, après cette
   journée-là ». L'ancre est l'identifiant de la dernière journée rendue, et
   c'est Postgres qui compare (voir `entry-feed.ts`) — rien d'un horodatage ne
   transite par le réseau, donc aucun fuseau ne peut s'y glisser.

   `from` est l'autre bord de la fenêtre : la date à partir de laquelle on
   REGARDE (« emmène-moi en mars »). Les deux se combinent — on saute à un mois,
   puis on continue à la suite.
   =========================================================================== */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Forme d'un mois de journal : AAAA-MM. */
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * L'ancre d'où repartir : l'identifiant de la dernière journée déjà rendue.
 * Une valeur qui n'est pas un identifiant est ignorée plutôt que refusée — un
 * curseur est un détail d'implémentation, pas une promesse d'API : le pire
 * qu'il puisse faire, c'est ramener la première page.
 */
export function parseCursor(raw: unknown): string | null {
  return typeof raw === "string" && UUID_RE.test(raw) ? raw : null;
}

/** Le bord haut de la fenêtre : on ne montre rien de plus récent que ce jour. */
export function parseFrom(raw: unknown): string | null {
  return typeof raw === "string" && isIsoDate(raw) ? raw : null;
}

/** Nombre de journées par page, borné des deux côtés. */
export function parseLimit(raw: unknown, { fallback = 20, max = 50 } = {}): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), 1), max);
}

/**
 * Le dernier jour d'un mois — ce que vaut « emmène-moi en mars » une fois
 * traduit en bord de fenêtre. `Date.UTC(année, mois, 0)` rend le dernier jour
 * du mois PRÉCÉDENT l'indice donné : en passant le numéro de mois tel qu'écrit
 * (1-12), on obtient donc le dernier jour de CE mois, années bissextiles
 * comprises, sans table ni condition.
 */
export function lastDayOfMonth(month: string): string | null {
  if (typeof month !== "string" || !MONTH_RE.test(month)) return null;
  const [year, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
}
