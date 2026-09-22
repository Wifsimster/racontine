/**
 * Arithmétique de calendrier — sans fuseau, sans base, sans HTTP.
 *
 * Une journée de carnet est une DATE au sens du calendrier (« le 25 novembre »),
 * pas un instant : deux parents dans deux fuseaux doivent voir la même journée.
 * Tout ce qui touche à ces dates vit donc ici, en fonctions pures, pour que les
 * services n'aient jamais à refaire le calcul — ni à se tromper de fuseau.
 */

/** Forme d'une date de journée : AAAA-MM-JJ. */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True si la chaîne est une date de calendrier RÉELLE, écrite AAAA-MM-JJ.
 *
 * La forme ne suffit pas : « 2025-11-31 » et « 2026-02-29 » la respectent et
 * n'existent pas. Laisser la validité calendaire au SGBD, comme on le faisait,
 * revenait à transformer une donnée douteuse en PANNE, et toujours au plus
 * mauvais endroit :
 *
 * · la lecture d'un carnet — le modèle vision lit un en-tête manuscrit et peut
 *   rendre un 31 novembre ; l'écriture échouait alors, et c'est la journée
 *   ENTIÈRE qui était perdue plutôt que sa seule date (on retombe maintenant
 *   sur la date de capture, qui reste éditable à la relecture) ;
 * · une date corrigée à la main — un 29 février d'année commune partait en
 *   erreur 500 au lieu du 400 qui dit quoi corriger.
 *
 * La vérification est un ALLER-RETOUR : on relit la chaîne, et seule une date
 * qui se réécrit à l'identique existe. Les analyseurs indulgents (« 2025-02-31 »
 * ramené au 3 mars) ne peuvent donc pas passer.
 */
export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/**
 * Fuseau du foyer : celui où « aujourd'hui » se décide. Le conteneur tourne
 * en UTC ; sans ce fuseau, une journée envoyée entre minuit et 2 h (heure de
 * Paris) sans date explicite tombait sur la VEILLE.
 */
export const HOUSEHOLD_TIMEZONE =
  process.env.APP_TIMEZONE || "Europe/Paris";

/** Date du jour dans le fuseau du foyer, en AAAA-MM-JJ. */
export function todayIso(
  now: Date = new Date(),
  timeZone: string = HOUSEHOLD_TIMEZONE,
): string {
  // `en-CA` écrit AAAA-MM-JJ.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** `date` (AAAA-MM-JJ) + `n` jours, en arithmétique calendaire (pas de fuseau). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
