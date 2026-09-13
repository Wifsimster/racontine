/* ===========================================================================
   L'ENFANT, COMME SIGNE.

   `Child` ne porte qu'un identifiant, un prénom et une date de naissance — et
   la date de naissance n'était lue nulle part. Dans un produit qui parle de
   CET enfant-là, deux enfants d'un même foyer produisaient donc deux cartes
   strictement identiques, le prénom se lisant en 13/20 dans une ligne de
   métadonnées.

   Deux signes, et pas un de plus :

   · LA PASTILLE D'INITIALE, volontairement ACHROMATIQUE. La tentation évidente
     serait une couleur par enfant ; elle est interdite ici, et pour une raison
     que le système énonce déjà : les cinq feutres disent repas, sieste,
     activité, anecdote, santé. Un sixième bleu « Léa » ferait dire deux choses
     à une teinte. L'initiale se pose donc sur `--muted`, en Fraunces — la
     serif du produit —, et ne consomme aucune couleur.

   · L'ÂGE EN CLAIR, qui est la donnée qu'un journal d'enfance doit porter et
     que celui-ci jetait. Dans six ans, on relira « 2 ans et 4 mois » bien plus
     souvent que « 8 septembre ».
   =========================================================================== */

/**
 * L'initiale d'un prénom, pour la pastille.
 *
 * `Intl` n'entre pas en jeu : on veut la première LETTRE, capitalisée, et rien
 * d'autre. Un prénom composé (« Marie-Lou ») donne « M » ; un prénom qui
 * commence par une lettre accentuée (« Élia ») garde son accent, parce que
 * c'est ainsi qu'il s'écrit.
 */
export function initialOf(name: string): string {
  const first = name.trim().match(/\p{L}/u);
  return first ? first[0].toLocaleUpperCase("fr-FR") : "·";
}

/**
 * L'âge, dit comme on le dit à voix haute.
 *
 *   moins d'un mois   « 3 semaines »
 *   moins de deux ans « 11 mois »          (c'est ainsi qu'on compte un bébé)
 *   au-delà           « 2 ans et 4 mois », « 3 ans » quand le mois est rond
 *
 * Renvoie `null` quand on ne sait pas (pas de date de naissance, date illisible,
 * ou date postérieure au jour demandé) : une valeur inventée serait pire que
 * l'absence, sur cette donnée-là en particulier.
 *
 * @param birthdate date ISO `YYYY-MM-DD`
 * @param on        le jour auquel on calcule l'âge (par défaut : aujourd'hui).
 *                  Sur une journée du carnet, c'est la date de la JOURNÉE : on
 *                  veut l'âge qu'avait l'enfant ce jour-là, pas celui qu'il a
 *                  au moment où on relit.
 */
export function ageLabel(
  birthdate: string | null | undefined,
  on?: string | Date,
): string | null {
  if (!birthdate) return null;
  const born = new Date(`${birthdate}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;

  const at =
    on === undefined
      ? new Date()
      : on instanceof Date
        ? on
        : new Date(`${on}T00:00:00`);
  if (Number.isNaN(at.getTime()) || at < born) return null;

  const days = Math.floor((at.getTime() - born.getTime()) / 86_400_000);
  if (days < 31) {
    const weeks = Math.floor(days / 7);
    if (weeks < 1) return days <= 1 ? `${days} jour` : `${days} jours`;
    return weeks === 1 ? "1 semaine" : `${weeks} semaines`;
  }

  // Mois pleins écoulés : on compte les mois de calendrier, puis on retire le
  // dernier s'il n'est pas achevé (né un 30, on n'a pas un mois de plus le 12).
  let months =
    (at.getFullYear() - born.getFullYear()) * 12 +
    (at.getMonth() - born.getMonth());
  if (at.getDate() < born.getDate()) months -= 1;

  if (months < 24) return months <= 1 ? "1 mois" : `${months} mois`;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (rest === 0) return `${years} ans`;
  return `${years} ans et ${rest} mois`;
}
