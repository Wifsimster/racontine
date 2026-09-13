import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Billing, PlanPrice } from "./types";

/* ===========================================================================
   L'ABONNEMENT, CÔTÉ ÉCRANS.

   Trois écrans posent la même question (le journal, la capture, l'abonnement),
   et il serait absurde qu'ouvrir l'app déclenche trois requêtes pour la même
   réponse. Le résultat est donc gardé ici, partagé, et invalidé explicitement
   quand quelque chose a pu changer (retour de paiement, passage par le portail).

   Deux règles tiennent ce fichier :

   · UN ÉCHEC N'EST PAS UN REFUS. Si `/api/billing` tombe, `billing` reste
     `null` et AUCUN écran n'affiche de mur : on ne ferme pas le carnet d'une
     famille parce qu'une requête a échoué. Le serveur, lui, refuse pour de bon
     s'il faut — c'est lui qui décide, pas l'affichage.
   · LE TARIF VIENT DU SERVEUR, qui le tient de Stripe. Aucun montant n'est
     écrit dans le front : le jour où le prix change dans le tableau de bord, il
     change ici sans redéploiement, et il ne peut pas mentir.
   =========================================================================== */

let cache: Billing | null = null;
let inflight: Promise<Billing> | null = null;
const listeners = new Set<(value: Billing | null) => void>();

function publish(value: Billing | null) {
  cache = value;
  for (const listener of listeners) listener(value);
}

/** Charge l'état (une seule requête en vol), en le partageant à tous les écrans. */
function load(force = false): Promise<Billing> {
  if (!force && cache) return Promise.resolve(cache);
  inflight ??= api
    .billing()
    .then((value) => {
      publish(value);
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** À appeler quand l'abonnement a pu changer (retour de Stripe, portail). */
export function refreshBilling(): Promise<Billing> {
  return load(true);
}

/** Remplace l'état connu (réponse de `/api/billing/sync`, déjà à jour). */
export function setBilling(value: Billing) {
  publish(value);
}

/**
 * `enabled` existe pour UNE raison : la coquille de l'app appelle ce hook avant
 * de savoir s'il y a une session (les hooks ne se conditionnent pas). Sans ce
 * garde-fou, toute ouverture de « / » déconnecté partait chercher un état
 * d'abonnement qui répondrait 401 avant la redirection vers la connexion.
 */
export function useBilling(enabled = true): {
  billing: Billing | null;
  loading: boolean;
  reload: () => Promise<Billing>;
} {
  const [billing, setLocal] = useState<Billing | null>(cache);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    if (!enabled) return;
    listeners.add(setLocal);
    let alive = true;
    load()
      .catch(() => {
        /* Silence VOULU : voir la règle « un échec n'est pas un refus ». */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      listeners.delete(setLocal);
    };
  }, [enabled]);

  const reload = useCallback(() => refreshBilling(), []);
  return { billing, loading, reload };
}

/* ---------------------------- Mise en forme ------------------------------ */

const INTERVALS: Record<string, string> = {
  day: "jour",
  week: "semaine",
  month: "mois",
  year: "an",
};

/** « 4,99 € » — le montant seul, dans la devise de Stripe. */
export function formatAmount(price: PlanPrice): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    // Un prix rond s'écrit « 39 € », pas « 39,00 € » : deux décimales inutiles
    // font lire un tarif plus lourd qu'il n'est.
    minimumFractionDigits: price.unitAmount % 100 === 0 ? 0 : 2,
  }).format(price.unitAmount / 100);
}

/** « par mois », « tous les 3 mois » — la période, en toutes lettres. */
export function formatInterval(price: PlanPrice): string {
  const unit = INTERVALS[price.interval] ?? price.interval;
  return price.intervalCount > 1
    ? `tous les ${price.intervalCount} ${unit}`
    : `par ${unit}`;
}

/** « 4,99 €/mois » — la forme courte, pour un bouton. */
export function formatPrice(price: PlanPrice): string {
  const unit = INTERVALS[price.interval] ?? price.interval;
  return price.intervalCount > 1
    ? `${formatAmount(price)} / ${price.intervalCount} ${unit}`
    : `${formatAmount(price)}/${unit}`;
}

/** « 3 octobre 2026 » — une date d'échéance se lit, elle ne se décode pas. */
export function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/**
 * Faut-il montrer quelque chose à propos de l'abonnement sur l'accueil ?
 *
 * NON quand tout va bien (abonné, ou instance auto-hébergée) : une app payée ne
 * continue pas à se vendre à celui qui l'a payée. OUI pendant l'essai, en cas
 * de prélèvement en échec, et bien sûr quand le carnet est fermé.
 */
export function shouldPrompt(billing: Billing | null): boolean {
  if (!billing?.enabled) return false;
  const { reason } = billing.access;
  return reason !== "self-hosted" && reason !== "subscribed";
}
