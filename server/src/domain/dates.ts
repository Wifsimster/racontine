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

/** True si la chaîne a la forme AAAA-MM-JJ (la validité calendaire reste au SGBD). */
export function isIsoDate(value: string): boolean {
  return DATE_RE.test(value);
}

/** Date du jour, en AAAA-MM-JJ. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `date` (AAAA-MM-JJ) + `n` jours, en arithmétique calendaire (pas de fuseau). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
