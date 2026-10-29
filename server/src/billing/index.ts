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

const SINGLETON_ID = "singleton";

type Row = typeof instanceSubscription.$inferSelect;

let client: StripeClient | null = null;

function stripe(): StripeClient | null {
  if (!billingEnabled()) return null;
  client ??= new StripeClient({ apiKey: config.billing.secretKey! });
  return client;
}

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

export async function blockedReason(): Promise<string | null> {
  const access = await currentAccess();
  if (access.open) return null;
  return access.reason === "subscription-over"
    ? "L'abonnement du carnet est terminé : on ne peut plus y ajouter de journée. Tout ce qui est déjà publié reste lisible et partagé. Reprenez l'abonnement depuis l'écran « L'abonnement » pour continuer."
    : "Votre essai gratuit est terminé : on ne peut plus ajouter de journée. Tout ce qui est déjà publié reste lisible et partagé. Abonnez-vous depuis l'écran « L'abonnement » pour continuer à remplir le carnet.";
}

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
    return priceCache?.price ?? null;
  }
}

export type BillingState = {
  enabled: boolean;
  access: CarnetAccess;
  price: PlanPrice | null;
  canManage: boolean;
  hasSubscription: boolean;
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

export type BillingLink =
  | { ok: true; url: string }
  | { ok: false; httpCode: number; error: string };

const NOT_ARMED: BillingLink = {
  ok: false,
  httpCode: 404,
  error: "Cette instance n'a pas d'abonnement : Racontine y est gratuit.",
};

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
      successUrl: `${base}?paiement=ok&session={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}?paiement=annule`,
      customerId: row.stripeCustomerId,
      customerEmail: me?.email ?? null,
      reference: userId,
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
      configurationId: config.billing.portalConfigId,
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

async function checkoutIsOurs(
  reference: string | null,
  customerId: string | null,
): Promise<boolean> {
  const owner = await ownerUserId();
  if (owner && reference === owner) return true;
  const row = await ensureRow(new Date());
  return Boolean(row.stripeCustomerId && customerId === row.stripeCustomerId);
}

async function concernsCurrent(snapshot: SubscriptionSnapshot): Promise<boolean> {
  const row = await ensureRow(new Date());
  if (!row.stripeCustomerId || snapshot.customerId !== row.stripeCustomerId)
    return false;
  return !row.stripeSubscriptionId || row.stripeSubscriptionId === snapshot.id;
}

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
      const reference =
        typeof event.data.client_reference_id === "string"
          ? event.data.client_reference_id
          : null;
      const customerId =
        typeof event.data.customer === "string" ? event.data.customer : null;
      if (!(await checkoutIsOurs(reference, customerId)))
        return { applied: false, reason: "autre foyer" };
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
      const snapshot = await api.getSubscription(subscriptionId);
      if (!(await concernsCurrent(snapshot)))
        return { applied: false, reason: "autre abonnement" };
      await save(snapshot, at);
      return { applied: true, reason: event.type };
    }

    case "customer.subscription.deleted": {
      const data = event.data;
      const snapshot: SubscriptionSnapshot = {
        id: String(data.id ?? ""),
        customerId: typeof data.customer === "string" ? data.customer : null,
        status: "canceled",
        currentPeriodEnd: periodEndFromEvent(data),
        cancelAtPeriodEnd: true,
      };
      if (!(await concernsCurrent(snapshot)))
        return { applied: false, reason: "autre abonnement" };
      await save(snapshot, at);
      return { applied: true, reason: event.type };
    }

    default:
      return { applied: false, reason: "événement ignoré" };
  }
}

function subscriptionIdOf(data: Record<string, unknown>): string | null {
  if (typeof data.subscription === "string") return data.subscription;
  if (typeof data.id === "string" && data.id.startsWith("sub_")) return data.id;
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

export async function syncFromCheckoutSession(
  sessionId: string,
): Promise<boolean> {
  const api = stripe();
  if (!api) return false;
  try {
    const session = await api.getCheckoutSession(sessionId);
    if (!session.subscriptionId) return false;
    if (!(await checkoutIsOurs(session.reference, session.customerId)))
      return false;
    await save(await api.getSubscription(session.subscriptionId), new Date());
    return true;
  } catch {
    return false;
  }
}
