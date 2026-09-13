/* ===========================================================================
   LA MESURE — quatre événements, et pas un de plus.

   Umami est chargé dans `index.html` : auto-hébergé, sans cookie, et réglé
   pour ne JAMAIS envoyer la query ni le fragment d'une URL (`data-exclude-
   search` / `data-exclude-hash`), parce qu'une adresse de carnet peut porter
   l'identifiant d'un enfant. Ce module suit la même règle d'un cran plus
   haut : il n'envoie que des NOMS D'ÉVÉNEMENTS. Jamais une adresse e-mail,
   jamais un prénom, jamais un identifiant, jamais un montant rattaché à
   quelqu'un. Si un jour un appel a besoin d'une donnée pour être utile, c'est
   le signe qu'il ne faut pas le poser.

   Pourquoi ces quatre-là, et pourquoi maintenant : depuis que l'accueil public
   montre l'offre au lieu du formulaire de connexion, personne ne peut dire si
   la page fait son travail. On mesure donc UNE question, celle qui a motivé le
   changement — sur cent personnes qui voient l'offre, combien ouvrent un
   carnet, et combien avaient déjà le leur ? Trois chiffres et leur
   dénominateur ; le reste serait de la collecte pour la collecte.

   Le tracker peut être absent (instance auto-hébergée, bloqueur de publicité,
   réseau coupé) : `mesure` ne lève jamais et ne change jamais ce que la page
   fait. Une mesure qui casse un parcours est pire que pas de mesure.
   =========================================================================== */

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, string | number>) => void;
    };
  }
}

/**
 * L'entonnoir de l'accueil public, de bout en bout. L'union est fermée exprès :
 * une chaîne libre finit toujours en `accueil_cta`, `accueil-cta` et
 * `accueilCTA` dans le même tableau de bord, trois mois plus tard.
 */
export type Evenement =
  /** L'offre a été VUE — le dénominateur de tout le reste. */
  | "accueil_offre_vue"
  /** « Commencer » : la personne va ouvrir un carnet. */
  | "accueil_commencer"
  /** « J'ai déjà un carnet » : elle en avait un, la page n'était qu'un passage. */
  | "accueil_connexion"
  /** Le compte est créé : l'entonnoir a abouti. */
  | "inscription_creee";

/**
 * Pose un repère, sans jamais faire échouer le geste qui l'a déclenché.
 *
 * Un repère peut précéder une navigation complète (l'inscription recharge la
 * page) : le tracker poste en `keepalive`, la requête survit donc au
 * déchargement. Rien à retarder, et surtout pas le parcours.
 */
export function mesure(evenement: Evenement): void {
  try {
    window.umami?.track(evenement);
  } catch {
    /* Silence VOULU : le tracker est absent, bloqué ou fâché. Ce n'est pas au
       parcours d'une famille d'en souffrir. */
  }
}
