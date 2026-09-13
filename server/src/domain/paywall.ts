/* ===========================================================================
   LE PÉAGE — écrit une fois, en fonction pure, et nulle part ailleurs.

   Trois principes tiennent tout ce fichier, et ils sont autant produit que
   technique :

   1. ON NE PREND JAMAIS LES SOUVENIRS EN OTAGE. Le journal déjà écrit reste
      lisible, cherchable, partageable, abonné ou non — pour toujours. Ce qui
      s'arrête faute d'abonnement, c'est l'AJOUT d'une nouvelle journée, c'est-
      à-dire le geste qui consomme quelque chose et qui a une valeur récurrente.
      Une app qui referme trois ans d'enfance sur un prélèvement échoué n'est pas
      un carnet, c'est une prise d'otage — et ce serait le contraire exact de la
      promesse « vos données restent à vous ».

   2. UN SEUL PAYEUR : LE FOYER. L'abonnement appartient à l'instance et se règle
      par son propriétaire (le premier compte, celui qui tient déjà les
      Réglages). Le co-parent contribue, mamie lit, et on ne leur demande JAMAIS
      de carte : la seule chose qui ferait fuir un grand-parent invité à voir sa
      petite-fille, c'est un formulaire de paiement.

   3. UNE INSTANCE SANS STRIPE N'A PAS DE PÉAGE. Racontine est auto-hébergeable,
      et ça n'est pas une clause de style : sur un homelab sans clé Stripe
      configurée, `enabled` vaut false et cette fonction ouvre tout. Le péage est
      l'affaire de l'offre HÉBERGÉE, pas du code.

   La fonction est pure (aucune base, aucun réseau, une horloge passée en
   argument) parce que c'est la règle qui décide si le geste du soir est possible
   ou non : elle doit pouvoir se vérifier en millisecondes, dans tous ses cas,
   y compris ceux qu'on espère ne jamais voir (carte expirée, remboursement,
   résiliation en cours de période).
   =========================================================================== */

/**
 * Statuts d'abonnement Stripe, tels quels. On garde le vocabulaire de Stripe
 * plutôt que de le traduire dans un enum maison : c'est la valeur qui arrive
 * dans les webhooks, et une deuxième nomenclature serait une deuxième vérité.
 */
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

const KNOWN_STATUSES: readonly string[] = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
];

/** Statut Stripe reconnu, ou null (statut inconnu = pas de statut). */
export function asSubscriptionStatus(
  raw: unknown,
): SubscriptionStatus | null {
  return typeof raw === "string" && KNOWN_STATUSES.includes(raw)
    ? (raw as SubscriptionStatus)
    : null;
}

/**
 * Durée de l'essai gratuit, en jours. Sans carte bancaire : l'essai n'est pas
 * un abonnement à zéro euro chez Stripe, c'est une date posée à l'ouverture du
 * foyer. Personne ne donne son numéro de carte pour photographier une page.
 */
export const TRIAL_DAYS = 14;

export type PaywallInput = {
  /** Le péage est-il armé sur cette instance (Stripe configuré) ? */
  enabled: boolean;
  /** Dernier statut connu de l'abonnement, ou null s'il n'y en a jamais eu. */
  status: SubscriptionStatus | null;
  /** Fin de la période déjà payée (Stripe), si connue. */
  currentPeriodEnd: Date | null;
  /** Résiliation demandée : l'abonnement s'arrête à la fin de la période. */
  cancelAtPeriodEnd: boolean;
  /** Fin de l'essai gratuit du foyer. */
  trialEndsAt: Date | null;
  now: Date;
};

/**
 * Pourquoi le carnet est ouvert, ou fermé. Le motif n'est pas décoratif : c'est
 * lui qui décide de la phrase affichée, et une phrase juste est la moitié du
 * travail quand on demande de l'argent à quelqu'un.
 */
export type AccessReason =
  /** Instance auto-hébergée, sans Stripe : tout est ouvert, et gratuit. */
  | "self-hosted"
  /** Essai gratuit en cours. */
  | "trial"
  /** Abonnement en règle. */
  | "subscribed"
  /** Prélèvement en échec : on laisse le carnet ouvert et on prévient. */
  | "payment-late"
  /** L'essai est fini et rien n'a été souscrit. */
  | "trial-over"
  /** L'abonnement est terminé (résilié, impayé jusqu'au bout). */
  | "subscription-over";

export type CarnetAccess = {
  /** Peut-on commencer une NOUVELLE journée ? (lire reste toujours possible) */
  open: boolean;
  reason: AccessReason;
  /** Jours entiers restants avant fermeture, pendant l'essai. Sinon null. */
  daysLeft: number | null;
  /** Date jusqu'à laquelle l'accès est acquis, si elle est connue. */
  until: Date | null;
  /** L'abonnement est résilié et s'arrêtera à `until`. */
  endingAt: Date | null;
};

/** Jours entiers restants, arrondis au supérieur (« il reste 1 jour » jusqu'au bout). */
export function daysUntil(target: Date, now: Date): number {
  const ms = target.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

/** Fin de l'essai d'un foyer dont le compteur démarre à `start`. */
export function trialEndFrom(start: Date): Date {
  return new Date(start.getTime() + TRIAL_DAYS * 86_400_000);
}

/**
 * LA décision : ce foyer peut-il commencer une nouvelle journée, maintenant ?
 *
 * L'ordre des cas est la politique commerciale, et chaque branche a sa raison :
 *
 * · `past_due` reste OUVERT. Stripe relance une carte refusée pendant deux à
 *   trois semaines ; couper le carnet au premier échec, c'est punir une famille
 *   pour une carte expirée pendant les vacances. On ouvre, et on le dit — la
 *   bannière fait le travail que la porte fermée ferait mal.
 * · une période DÉJÀ PAYÉE ne se reprend pas. Un abonnement résilié ou tombé en
 *   impayé garde le carnet ouvert jusqu'à `currentPeriodEnd` : c'est payé.
 * · l'essai n'est consulté qu'en dernier, pour un foyer qui n'a jamais souscrit.
 */
export function carnetAccess(input: PaywallInput): CarnetAccess {
  const { enabled, status, currentPeriodEnd, cancelAtPeriodEnd, trialEndsAt, now } =
    input;

  if (!enabled)
    return {
      open: true,
      reason: "self-hosted",
      daysLeft: null,
      until: null,
      endingAt: null,
    };

  const paidPeriodLeft =
    currentPeriodEnd !== null && currentPeriodEnd.getTime() > now.getTime();

  if (status === "active" || status === "trialing")
    return {
      open: true,
      reason: "subscribed",
      daysLeft: null,
      until: currentPeriodEnd,
      endingAt: cancelAtPeriodEnd ? currentPeriodEnd : null,
    };

  if (status === "past_due")
    return {
      open: true,
      reason: "payment-late",
      daysLeft: null,
      until: currentPeriodEnd,
      endingAt: null,
    };

  // Résilié, impayé, jamais confirmé… : ce qui est payé reste dû au foyer.
  if (status !== null && paidPeriodLeft)
    return {
      open: true,
      reason: "subscribed",
      daysLeft: null,
      until: currentPeriodEnd,
      endingAt: currentPeriodEnd,
    };

  const trialLeft =
    trialEndsAt !== null && trialEndsAt.getTime() > now.getTime();
  if (trialLeft)
    return {
      open: true,
      reason: "trial",
      daysLeft: daysUntil(trialEndsAt!, now),
      until: trialEndsAt,
      endingAt: null,
    };

  return {
    open: false,
    // Un foyer qui a déjà eu un abonnement n'a pas « fini son essai » : lui
    // redire « essai terminé » six mois après serait une phrase fausse.
    reason: status === null ? "trial-over" : "subscription-over",
    daysLeft: 0,
    until: null,
    endingAt: null,
  };
}
