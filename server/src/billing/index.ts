import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { instanceSubscription, user as userTable } from "../db/schema.js";
import { billingEnabled, config } from "../config.js";
import { ownerUserId } from "../access.js";
import {
  asSubscriptionStatus,
  carnetAccess,
  trialEndFrom,
  type CarnetAccess,
} from "../domain/paywall.js";
import {
  StripeClient,
  type PlanPrice,
  type SubscriptionSnapshot,
} from "./stripe.js";

/* ===========================================================================
   LA CAISSE — tout ce qui se passe entre la règle (domain/paywall.ts) et
   Stripe (billing/stripe.ts).

   Ce module tient trois promesses, et rien d'autre :

   · UNE SEULE LIGNE en base, celle du foyer, créée à la première consultation
     du péage. Une instance auto-hébergée sans Stripe n'en a même pas une.
   · AUCUNE DONNÉE BANCAIRE ne traverse Racontine : la page de paiement et le
     portail (changer de carte, prendre une facture, RÉSILIER) sont hébergés par
     Stripe, et on ne fait que fabriquer les liens.
   · LE PRIX N'EST PAS ÉCRIT ICI. Il est lu chez Stripe et mis en cache dix
     minutes. Un tarif recopié dans le code est un tarif qui finira par mentir
     juste au-dessus du bouton de paiement.
   =========================================================================== */

const SINGLETON_ID = "singleton";

/** Ligne d'abonnement du foyer, telle qu'en base. */
type Row = typeof instanceSubscription.$inferSelect;

let client: StripeClient | null = null;

/** Le client Stripe de l'instance, ou null si le péage est désarmé. */
function stripe(): StripeClient | null {
  if (!billingEnabled()) return null;
  client ??= new StripeClient({ apiKey: config.billing.secretKey! });
  return client;
}

/**
 * La ligne du foyer, créée si elle manque — c'est ici, et seulement ici, que
 * l'essai gratuit commence à courir.
 *
 * Pourquoi la date d'essai naît à la PREMIÈRE CONSULTATION et non à la création
 * du compte : une instance installée depuis six mois, le jour où l'on branche
 * Stripe, se retrouverait sinon fermée à la seconde même — son foyer aurait
 * « épuisé » un essai qui n'a jamais existé. En posant la date au premier
 * regard, un foyer neuf ET un foyer existant reçoivent exactement les mêmes
 * quatorze jours.
 */
async function ensureRow(now: Date): Promise<Row> {
  await db
    .insert(instanceSubscription)
    .values({ id: SINGLETON_ID, trialEndsAt: trialEndFrom(now) })
    .onConflictDoNothing({ target: instanceSubscription.id });
  const [row] = await db
    .select()
    .from(instanceSubscription)
    .where(eq(instanceSubscription.id, SINGLETON_ID))
    .limit(1);
  return row!;
}

/** L'accès au carnet, maintenant. La seule question que pose le reste du code. */
export async function currentAccess(now = new Date()): Promise<CarnetAccess> {
  if (!billingEnabled())
    return carnetAccess({
      enabled: false,
      status: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      trialEndsAt: null,
      now,
    });

  const row = await ensureRow(now);
  return carnetAccess({
    enabled: true,
    status: asSubscriptionStatus(row.status),
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    trialEndsAt: row.trialEndsAt,
    now,
  });
}

/**
 * LE REFUS, EN UNE PHRASE — ou `null` quand le carnet est ouvert. C'est
 * l'implémentation du port `Paywall` : la seule chose que le code métier sait du
 * péage.
 *
 * Les deux phrases disent la même chose dans le même ordre : ce qui s'arrête
 * (ajouter une journée), ce qui continue (tout ce qui est déjà écrit), et le
 * geste qui rouvre. Le journal qu'on a déjà rempli n'est jamais repris — le
 * redire ici, à l'endroit exact du refus, est la moitié du travail.
 */
export async function blockedReason(): Promise<string | null> {
  const access = await currentAccess();
  if (access.open) return null;
  return access.reason === "subscription-over"
    ? "L'abonnement du carnet est terminé : on ne peut plus y ajouter de journée. Tout ce qui est déjà publié reste lisible et partagé. Reprenez l'abonnement depuis l'écran « L'abonnement » pour continuer."
    : "Votre essai gratuit est terminé : on ne peut plus ajouter de journée. Tout ce qui est déjà publié reste lisible et partagé. Abonnez-vous depuis l'écran « L'abonnement » pour continuer à remplir le carnet.";
}

/* ------------------------------- Le tarif -------------------------------- */

/**
 * Le prix, lu chez Stripe et gardé dix minutes. Le cache n'est pas de la
 * performance : c'est la garantie qu'une panne d'API Stripe n'efface pas le
 * tarif de la page (on garde la dernière valeur connue plutôt que d'afficher un
 * trou ou, pire, un montant de secours inventé).
 */
const PRICE_TTL_MS = 10 * 60 * 1000;
let priceCache: { at: number; price: PlanPrice } | null = null;

export async function planPrice(): Promise<PlanPrice | null> {
  const api = stripe();
  if (!api) return null;
  if (priceCache && Date.now() - priceCache.at < PRICE_TTL_MS)
    return priceCache.price;
  try {
    const price = await api.getPrice(config.billing.priceId!);
    priceCache = { at: Date.now(), price };
    return price;
  } catch {
    // Mieux vaut le dernier prix connu (ou aucun prix, et la page le dira) que
    // de faire tomber l'écran d'abonnement parce que Stripe tousse.
    return priceCache?.price ?? null;
  }
}

/* --------------------------- L'état, pour l'UI ---------------------------- */

export type BillingState = {
  /** Le péage est-il armé sur cette instance ? */
  enabled: boolean;
  access: CarnetAccess;
  price: PlanPrice | null;
  /** L'appelant peut-il payer / gérer l'abonnement (propriétaire du foyer) ? */
  canManage: boolean;
  /** Un abonnement a-t-il déjà existé (→ portail plutôt que paiement) ? */
  hasSubscription: boolean;
  /** Qui règle l'abonnement, pour les autres membres du foyer. */
  billedTo: { name: string; email: string } | null;
};

export async function billingState(userId: string): Promise<BillingState> {
  const access = await currentAccess();
  if (!billingEnabled())
    return {
      enabled: false,
      access,
      price: null,
      canManage: false,
      hasSubscription: false,
      billedTo: null,
    };

  const [row, price, owner] = await Promise.all([
    ensureRow(new Date()),
    planPrice(),
    ownerUserId(),
  ]);

  let billedTo: BillingState["billedTo"] = null;
  if (owner) {
    const [o] = await db
      .select({ name: userTable.name, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, owner))
      .limit(1);
    billedTo = o ?? null;
  }

  return {
    enabled: true,
    access,
    price,
    canManage: owner !== null && owner === userId,
    hasSubscription: Boolean(row.stripeCustomerId),
    billedTo,
  };
}

/* ---------------------------- Payer, gérer -------------------------------- */

export type BillingLink =
  | { ok: true; url: string }
  | { ok: false; httpCode: number; error: string };

const NOT_ARMED: BillingLink = {
  ok: false,
  httpCode: 404,
  error: "Cette instance n'a pas d'abonnement : Racontine y est gratuit.",
};

/**
 * Ouvre la page de paiement Stripe pour le propriétaire du foyer.
 *
 * Pourquoi le propriétaire et lui seul : il y a UNE carte par foyer, celle de
 * qui a installé Racontine. Laisser le co-parent souscrire de son côté
 * fabriquerait deux abonnements pour un seul carnet — et la découverte se
 * ferait sur un relevé bancaire.
 */
export async function startCheckout(userId: string): Promise<BillingLink> {
  const api = stripe();
  if (!api) return NOT_ARMED;

  const owner = await ownerUserId();
  if (owner !== userId)
    return {
      ok: false,
      httpCode: 403,
      error: "L'abonnement se règle depuis le compte qui a ouvert le carnet.",
    };

  const row = await ensureRow(new Date());
  const [me] = await db
    .select({ email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  const base = `${config.webBaseUrl}/abonnement`;
  try {
    const session = await api.createCheckoutSession({
      priceId: config.billing.priceId!,
      // `{CHECKOUT_SESSION_ID}` est remplacé par Stripe : c'est ce qui permet de
      // rattraper le paiement au retour, même si le webhook est en retard.
      successUrl: `${base}?paiement=ok&session={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}?paiement=annule`,
      customerId: row.stripeCustomerId,
      customerEmail: me?.email ?? null,
      reference: SINGLETON_ID,
    });
    return { ok: true, url: session.url };
  } catch (err) {
    return {
      ok: false,
      httpCode: 502,
      error: err instanceof Error ? err.message : "Stripe est injoignable.",
    };
  }
}

/** Portail Stripe : carte, factures, résiliation. Trois écrans qu'on n'écrit pas. */
export async function openPortal(userId: string): Promise<BillingLink> {
  const api = stripe();
  if (!api) return NOT_ARMED;

  const owner = await ownerUserId();
  if (owner !== userId)
    return {
      ok: false,
      httpCode: 403,
      error: "L'abonnement se gère depuis le compte qui a ouvert le carnet.",
    };

  const row = await ensureRow(new Date());
  if (!row.stripeCustomerId)
    return {
      ok: false,
      httpCode: 409,
      error: "Aucun abonnement à gérer pour l'instant.",
    };

  try {
    const session = await api.createPortalSession({
      customerId: row.stripeCustomerId,
      returnUrl: `${config.webBaseUrl}/abonnement`,
    });
    return { ok: true, url: session.url };
  } catch (err) {
    return {
      ok: false,
      httpCode: 502,
      error: err instanceof Error ? err.message : "Stripe est injoignable.",
    };
  }
}

/* ------------------------- Ce que Stripe nous dit ------------------------- */

/** Écrit l'instantané d'abonnement dans la ligne du foyer. */
async function save(
  snapshot: SubscriptionSnapshot,
  eventAt: Date | null,
): Promise<void> {
  await ensureRow(new Date());
  await db
    .update(instanceSubscription)
    .set({
      stripeSubscriptionId: snapshot.id || null,
      stripeCustomerId: snapshot.customerId,
      status: snapshot.status,
      currentPeriodEnd: snapshot.currentPeriodEnd,
      cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      lastEventAt: eventAt,
      updatedAt: new Date(),
    })
    .where(eq(instanceSubscription.id, SINGLETON_ID));
}

/**
 * Applique un événement Stripe déjà VÉRIFIÉ (la signature se contrôle dans la
 * route, avec le corps brut).
 *
 * On ne fait jamais confiance au contenu de l'événement pour l'abonnement
 * lui-même : on RELIT l'abonnement chez Stripe avec son identifiant. Un
 * événement peut arriver en retard, dans le désordre, ou en double ; l'état
 * relu, lui, est celui d'aujourd'hui. Le seul cas où l'on écrit sans relire est
 * la suppression, qui est définitive.
 */
export async function applyStripeEvent(event: {
  id: string;
  type: string;
  data: Record<string, unknown>;
  createdAt?: Date | null;
}): Promise<{ applied: boolean; reason: string }> {
  const api = stripe();
  if (!api) return { applied: false, reason: "péage désarmé" };

  const at = event.createdAt ?? new Date();

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const subscriptionId =
        typeof event.data.subscription === "string"
          ? event.data.subscription
          : null;
      if (!subscriptionId) return { applied: false, reason: "sans abonnement" };
      await save(await api.getSubscription(subscriptionId), at);
      return { applied: true, reason: event.type };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
    case "invoice.paid":
    case "invoice.payment_failed": {
      const subscriptionId = subscriptionIdOf(event.data);
      if (!subscriptionId) return { applied: false, reason: "sans abonnement" };
      await save(await api.getSubscription(subscriptionId), at);
      return { applied: true, reason: event.type };
    }

    case "customer.subscription.deleted": {
      // Un abonnement supprimé ne se relit pas : Stripe rend l'objet final dans
      // l'événement, et c'est le dernier mot.
      const data = event.data;
      await save(
        {
          id: String(data.id ?? ""),
          customerId:
            typeof data.customer === "string" ? data.customer : null,
          status: "canceled",
          currentPeriodEnd: periodEndFromEvent(data),
          cancelAtPeriodEnd: true,
        },
        at,
      );
      return { applied: true, reason: event.type };
    }

    default:
      // Stripe envoie ce qu'on a coché dans le tableau de bord, et souvent plus.
      // Ignorer explicitement vaut mieux que 400 : une erreur ferait relancer
      // l'événement toutes les heures pendant trois jours.
      return { applied: false, reason: "événement ignoré" };
  }
}

/** Identifiant d'abonnement porté par un objet d'événement (sub, facture…). */
function subscriptionIdOf(data: Record<string, unknown>): string | null {
  if (typeof data.subscription === "string") return data.subscription;
  if (typeof data.id === "string" && data.id.startsWith("sub_")) return data.id;
  // Facture des versions récentes : l'abonnement est porté par ses lignes.
  const lines = (data.lines as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];
  for (const line of lines) {
    const parent = line.parent as Record<string, unknown> | undefined;
    const details = parent?.subscription_item_details as
      | Record<string, unknown>
      | undefined;
    if (typeof details?.subscription === "string") return details.subscription;
  }
  return null;
}

function periodEndFromEvent(data: Record<string, unknown>): Date | null {
  const raw = data.current_period_end ?? data.ended_at ?? data.canceled_at;
  return typeof raw === "number" ? new Date(raw * 1000) : null;
}

/**
 * RATTRAPAGE AU RETOUR DU CLIENT. Le webhook est la source de vérité, mais il
 * peut arriver quelques secondes après que le parent est revenu sur l'app — et
 * voir « votre essai est terminé » trois secondes après avoir payé est la pire
 * seconde du produit. On relit donc la session de paiement à l'atterrissage.
 * Idempotent : il écrit exactement ce que le webhook écrira.
 */
export async function syncFromCheckoutSession(
  sessionId: string,
): Promise<boolean> {
  const api = stripe();
  if (!api) return false;
  try {
    const session = await api.getCheckoutSession(sessionId);
    if (!session.subscriptionId) return false;
    await save(await api.getSubscription(session.subscriptionId), new Date());
    return true;
  } catch {
    return false;
  }
}
